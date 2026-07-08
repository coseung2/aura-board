import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";
import {
  giveYellowCard,
  getTodayYellowCards,
  getTodayCleaningDuty,
} from "@/lib/yellow-card";

/**
 * GET  /api/classrooms/:id/yellow-cards
 *      Returns today's yellow cards. Teacher-only.
 *
 * POST /api/classrooms/:id/yellow-cards
 *      Teacher-only. Body: { studentId, reason }.
 *      Creates a YellowCard row; if this becomes the student's 2nd card
 *      today, also upserts a CleaningDuty row for today (single tx).
 */

const Body = z.object({
  studentId: z.string().min(1),
  reason: z.string().min(1).max(500),
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
  if (isTeacher) return { status: 200 as const, user, student, isTeacher: true as const };

  // 체크원(checks.manage 권한) 학생도 노란 카드 부여 가능
  const checkerAllowed = student
    ? await hasPermission(classroomId, { studentId: student.id }, "checks.manage")
    : false;
  if (!checkerAllowed) return { status: 403 as const };
  return { status: 200 as const, user: null, student, isTeacher: false as const };
}

type AuthResult = { status: 200; user: { id: string; name: string } | null; student: { id: string; name: string } | null; isTeacher: boolean } | { status: 401 | 403 | 404 };

function errorForStatus(status: 401 | 403 | 404) {
  if (status === 401) return NextResponse.json({ error: "Unauthorized" }, { status });
  if (status === 403) return NextResponse.json({ error: "Forbidden" }, { status });
  return NextResponse.json({ error: "Not found" }, { status });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const auth = await authorize(classroomId);
  if (auth.status !== 200) return errorForStatus(auth.status);

  const [cards, duties] = await Promise.all([
    getTodayYellowCards(classroomId),
    getTodayCleaningDuty(classroomId),
  ]);
  return NextResponse.json({ cards, duties });
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

  // 학생이 학급에 속하는지 확인.
  const targetStudent = await db.student.findUnique({
    where: { id: parsed.data.studentId },
    select: { id: true, classroomId: true },
  });
  if (!targetStudent || targetStudent.classroomId !== classroomId) {
    return NextResponse.json(
      { error: "학급에 속하지 않는 학생입니다." },
      { status: 400 },
    );
  }

  const actor = auth.isTeacher
    ? { kind: "teacher" as const, userId: auth.user!.id }
    : { kind: "student" as const, studentId: auth.student!.id };

  const result = await giveYellowCard(
    classroomId,
    parsed.data.studentId,
    parsed.data.reason,
    actor,
  );
  return NextResponse.json({
    card: {
      id: result.card.id,
      studentId: result.card.studentId,
      reason: result.card.reason,
      givenAt: result.card.givenAt.toISOString(),
    },
    todayCount: result.todayCount,
    promotedToCleaningDuty: result.promotedToCleaningDuty,
    cleaningDutyId: result.cleaningDutyId,
  });
}
