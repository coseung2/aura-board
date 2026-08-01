import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  CLASSROOM_ROLE_PAY_MODES,
  CLASSROOM_ROLE_PAY_PERIODS,
  resolveClassroomRolePayPolicy,
} from "@/lib/classroom-role-settings";

/**
 * 급여 지급 정책은 학급 단위 단일 값이다. 예전에는 역할마다 같은 값을 복제해서
 * 토글 한 번에 역할 수만큼 PATCH 가 나갔고, 값이 어긋나면 대시보드가 혼합
 * 상태로 보였다. 이 라우트는 학급당 한 행만 갱신한다.
 */
const Body = z
  .object({
    payMode: z.enum(CLASSROOM_ROLE_PAY_MODES).optional(),
    payPeriod: z.enum(CLASSROOM_ROLE_PAY_PERIODS).optional(),
    payAnchor: z.number().int().min(1).max(31).nullable().optional(),
  })
  .refine(
    ({ payMode, payPeriod, payAnchor }) =>
      payMode !== undefined || payPeriod !== undefined || payAnchor !== undefined,
    { message: "No pay policy supplied" },
  );

async function requireTeacher(classroomId: string) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  if (!classroom) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (classroom.teacherId !== user.id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

// GET /api/classrooms/:id/roles/pay-policy
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const auth = await requireTeacher(classroomId);
  if (auth.error) return auth.error;

  const policy = await db.classroomRolePayPolicy.findUnique({
    where: { classroomId },
    select: { payMode: true, payPeriod: true, payAnchor: true },
  });

  return NextResponse.json(resolveClassroomRolePayPolicy(policy));
}

// PUT /api/classrooms/:id/roles/pay-policy
// Single upsert for the whole classroom, so the pay bar is one round trip.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "지급 설정을 확인해 주세요." }, { status: 400 });
  }

  const auth = await requireTeacher(classroomId);
  if (auth.error) return auth.error;

  const current = resolveClassroomRolePayPolicy(
    await db.classroomRolePayPolicy.findUnique({
      where: { classroomId },
      select: { payMode: true, payPeriod: true, payAnchor: true },
    }),
  );

  const payMode = parsed.data.payMode ?? current.payMode;
  const payPeriod = parsed.data.payPeriod ?? current.payPeriod;
  // 주기가 바뀌면 기준일 의미도 바뀐다. 일급은 기준일이 없고, 주급/월급으로
  // 넘어올 때 값이 지정되지 않으면 1(월요일 / 1일)로 되돌린다.
  const requestedAnchor =
    parsed.data.payAnchor !== undefined
      ? parsed.data.payAnchor
      : parsed.data.payPeriod !== undefined && parsed.data.payPeriod !== current.payPeriod
        ? 1
        : current.payAnchor;
  const payAnchor = payPeriod === "daily" ? null : requestedAnchor ?? 1;

  if (payPeriod === "weekly" && payAnchor !== null && payAnchor > 7) {
    return NextResponse.json(
      { error: "주급 기준일은 1~7(월~일) 사이여야 합니다." },
      { status: 400 },
    );
  }

  const saved = await db.classroomRolePayPolicy.upsert({
    where: { classroomId },
    create: { classroomId, payMode, payPeriod, payAnchor },
    update: { payMode, payPeriod, payAnchor },
    select: { payMode: true, payPeriod: true, payAnchor: true },
  });

  return NextResponse.json(resolveClassroomRolePayPolicy(saved));
}
