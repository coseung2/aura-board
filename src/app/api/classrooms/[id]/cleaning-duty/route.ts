import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseDateOrNull, todayDateString } from "@/lib/inspector-findings";
import { getTodayCleaningDuty } from "@/lib/yellow-card";
import { announceClassroomMorningChange } from "@/lib/realtime-broadcast";

/**
 * GET  /api/classrooms/:id/cleaning-duty
 *      Returns today's cleaning duty roster (id, studentId, source, ...).
 *      Query: ?date=YYYY-MM-DD (default = today). Read access follows
 *      classroom.teacherId; the cleaning duty list is teacher-facing only.
 *
 * POST /api/classrooms/:id/cleaning-duty
 *      Teacher-only. Body: { studentIds: string[], date?: "YYYY-MM-DD" }.
 *      Upserts CleaningDuty rows for the given date (default = today).
 *      Idempotent — re-posting the same studentId is a no-op.
 */

const Body = z.object({
  studentIds: z.array(z.string().min(1)).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

async function authorize(classroomId: string) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { status: 401 as const };
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  if (!classroom) return { status: 404 as const };
  if (classroom.teacherId !== user.id) return { status: 403 as const };
  return { status: 200 as const, user };
}

function errorForStatus(status: 401 | 403 | 404) {
  if (status === 401) return NextResponse.json({ error: "Unauthorized" }, { status });
  if (status === 403) return NextResponse.json({ error: "Forbidden" }, { status });
  return NextResponse.json({ error: "Not found" }, { status });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const auth = await authorize(classroomId);
  if (auth.status !== 200) return errorForStatus(auth.status);

  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date") ?? todayDateString();
  const date = parseDateOrNull(dateStr);
  if (!date) {
    return NextResponse.json({ error: "날짜 형식을 확인해주세요." }, { status: 400 });
  }

  if (dateStr === todayDateString()) {
    // Fast path: today -> delegate to helper for consistent ordering/joins.
    const rows = await getTodayCleaningDuty(classroomId);
    return NextResponse.json({ date: dateStr, duties: rows });
  }

  const tomorrow = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  const rows = await db.cleaningDuty.findMany({
    where: { classroomId, dutyDate: { gte: date, lt: tomorrow } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      studentId: true,
      dutyDate: true,
      source: true,
      createdAt: true,
      student: { select: { name: true, number: true } },
    },
  });
  rows.sort((a, b) => {
    const an = a.student.number ?? Number.POSITIVE_INFINITY;
    const bn = b.student.number ?? Number.POSITIVE_INFINITY;
    if (an !== bn) return an - bn;
    return a.student.name.localeCompare(b.student.name, "ko");
  });
  return NextResponse.json({
    date: dateStr,
    duties: rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      studentName: row.student.name,
      studentNumber: row.student.number,
      dutyDate: row.dutyDate,
      source: row.source,
      assignedAt: row.createdAt,
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const auth = await authorize(classroomId);
  if (auth.status !== 200) return errorForStatus(auth.status);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값을 확인해주세요." }, { status: 400 });
  }
  const dateStr = parsed.data.date ?? todayDateString();
  const date = parseDateOrNull(dateStr);
  if (!date) {
    return NextResponse.json({ error: "날짜 형식을 확인해주세요." }, { status: 400 });
  }

  const studentIds = Array.from(new Set(parsed.data.studentIds));
  if (studentIds.length === 0) {
    return NextResponse.json({ date: dateStr, added: 0 });
  }

  // 학급에 속한 학생만 허용.
  const validStudents = await db.student.findMany({
    where: { classroomId, id: { in: studentIds } },
    select: { id: true },
  });
  if (validStudents.length !== studentIds.length) {
    return NextResponse.json(
      { error: "학급에 속하지 않는 학생이 포함되어 있습니다." },
      { status: 400 },
    );
  }

  const now = new Date();
  let added = 0;
  for (const student of validStudents) {
    const result = await db.cleaningDuty.upsert({
      where: {
        classroomId_studentId_dutyDate: {
          classroomId,
          studentId: student.id,
          dutyDate: date,
        },
      },
      create: {
        classroomId,
        studentId: student.id,
        dutyDate: date,
        source: "manual",
        assignedByUserId: auth.user.id,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        updatedAt: now,
      },
      select: { id: true, createdAt: true },
    });
    // createdAt 가 now 와 1초 이내면 신규 row 로 간주 (대략적).
    if (Math.abs(result.createdAt.getTime() - now.getTime()) < 1000) {
      added += 1;
    }
  }

  await announceClassroomMorningChange(
    classroomId,
    "cleaning_duty",
    dateStr,
  );

  return NextResponse.json({ date: dateStr, added });
}
