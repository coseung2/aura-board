import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";
import { parseDateOrNull, todayDateString } from "@/lib/inspector-findings";
import { announceClassroomMorningChange } from "@/lib/realtime-broadcast";

const Body = z.object({
  findings: z
    .array(
      z.object({
        studentId: z.string().min(1),
        notArranged: z.boolean(),
      }),
    )
    .max(200),
  // POST accepts body.date (YYYY-MM-DD) to record findings for a
  // different day; defaults to today. Mirrors GET ?date=.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

async function authorize(classroomId: string) {
  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) return { status: 401 as const };

  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  if (!classroom) return { status: 404 as const };

  const isTeacher = user?.id === classroom.teacherId;
  const inspectorAllowed = await hasPermission(
    classroomId,
    { userId: user?.id, studentId: student?.id },
    "inspections.shoes",
  );
  if (!inspectorAllowed) return { status: 403 as const };
  return { status: 200 as const, user, student, isTeacher };
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

  const [students, findings] = await Promise.all([
    db.student.findMany({
      where: { classroomId },
      orderBy: [{ number: "asc" }, { name: "asc" }],
      select: { id: true, name: true, number: true },
    }),
    db.shoeFinding.findMany({
      where: { classroomId, findingDate: date, notArranged: true },
      orderBy: { createdAt: "desc" },
      include: {
        reporter: { select: { id: true, name: true } },
        reporterUser: { select: { id: true, name: true } },
      },
    }),
  ]);

  const findingByStudent = new Map<string, (typeof findings)[number]>();
  for (const finding of findings) {
    if (!findingByStudent.has(finding.markedStudentId)) {
      findingByStudent.set(finding.markedStudentId, finding);
    }
  }

  return NextResponse.json({
    date: dateStr,
    inspector: auth.student ? { id: auth.student.id, name: auth.student.name } : null,
    roster: students.map((student) => {
      const finding = findingByStudent.get(student.id);
      return {
        student,
        finding: finding
          ? {
              notArranged: true,
              recordedAt: finding.createdAt.toISOString(),
              recordedByName: finding.reporter?.name ?? finding.reporterUser?.name ?? null,
            }
          : null,
      };
    }),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const auth = await authorize(classroomId);
  if (auth.status !== 200) return errorForStatus(auth.status);
  if (!auth.isTeacher && !auth.student) {
    return NextResponse.json(
      { error: "학생 검사 담당만 결과를 저장할 수 있습니다." },
      { status: 403 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "검사 결과 입력값을 확인해주세요." }, { status: 400 });
  }

  const dateStr = parsed.data.date ?? todayDateString();
  const date = parseDateOrNull(dateStr);
  if (!date) {
    return NextResponse.json({ error: "날짜 형식을 확인해주세요." }, { status: 400 });
  }

  const studentIds = Array.from(new Set(parsed.data.findings.map((finding) => finding.studentId)));
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

  const flaggedFindings = parsed.data.findings.filter((finding) => finding.notArranged);
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.shoeFinding.deleteMany({
      where: { classroomId, findingDate: date },
    });
    if (flaggedFindings.length > 0) {
      await tx.shoeFinding.createMany({
        data: flaggedFindings.map((finding) => ({
          classroomId,
          reporterId: auth.student?.id ?? null,
          reporterUserId: auth.isTeacher ? auth.user?.id ?? null : null,
          markedStudentId: finding.studentId,
          notArranged: true,
          note: null,
          findingDate: date,
          createdAt: now,
          updatedAt: now,
        })),
      });
    }
  });

  await announceClassroomMorningChange(
    classroomId,
    "shoe_inspection",
    dateStr,
  );

  return NextResponse.json({ savedAt: now.toISOString() });
}
