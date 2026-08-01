import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  payClassroomRoleSalaries,
  payRoleSalaryBatch,
  RoleSalaryPayoutError,
} from "@/lib/role-salary-payout";

const RequestKey = z
  .string()
  .trim()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/);

const Body = z.object({
  /**
   * 생략하면 학급의 지급 가능한 모든 역할을 한 번에 지급한다. 대시보드 지급
   * 버튼이 이 경로를 쓰므로 클릭당 요청은 1회다.
   */
  roleKey: z.string().min(1).optional(),
  requestKey: RequestKey.optional(),
});

// POST /api/classrooms/:id/roles/pay
// roleKey 지정 시 그 역할만, 생략 시 학급 전체 역할을 지급한다. Teacher only;
// used by the 수동지급 action on the dashboard pay bar.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "roleKey 또는 requestKey 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const headerKey = req.headers.get("idempotency-key")?.trim();
  const parsedHeaderKey = headerKey ? RequestKey.safeParse(headerKey) : null;
  if (parsedHeaderKey && !parsedHeaderKey.success) {
    return NextResponse.json({ error: "Invalid Idempotency-Key" }, { status: 400 });
  }
  if (
    parsed.data.requestKey &&
    parsedHeaderKey?.success &&
    parsed.data.requestKey !== parsedHeaderKey.data
  ) {
    return NextResponse.json({ error: "idempotency_key_mismatch" }, { status: 400 });
  }
  const requestKey =
    parsed.data.requestKey ??
    (parsedHeaderKey?.success ? parsedHeaderKey.data : randomUUID());

  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (classroom.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const roleKey = parsed.data.roleKey;
    const result = roleKey
      ? await payRoleSalaryBatch({
          classroomId,
          roleKey,
          requestKey,
          performedById: user.id,
        })
      : await payClassroomRoleSalaries({
          classroomId,
          requestKey,
          performedById: user.id,
        });
    return NextResponse.json(result, {
      headers: { "Idempotency-Key": requestKey },
    });
  } catch (error) {
    if (!(error instanceof RoleSalaryPayoutError)) throw error;
    const response = (() => {
      switch (error.code) {
        case "unknown_role":
          return NextResponse.json({ error: "Unknown role" }, { status: 400 });
        case "role_disabled":
          return NextResponse.json({ error: "Role is disabled" }, { status: 409 });
        case "invalid_salary":
          return NextResponse.json(
            { error: "급여가 0원인 역할은 지급할 수 없습니다." },
            { status: 400 },
          );
        case "no_assignees":
          return NextResponse.json(
            {
              error: parsed.data.roleKey
                ? "지급할 담당 학생이 없습니다."
                : "지급할 수 있는 역할이 없습니다.",
            },
            { status: 400 },
          );
        case "already_applied":
          return NextResponse.json(
            { error: "salary_payout_already_applied" },
            { status: 409 },
          );
      }
    })();
    response.headers.set("Idempotency-Key", requestKey);
    return response;
  }
}
