import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import {
  payClassroomRoleSalaries,
  RoleSalaryPayoutError,
} from "@/lib/role-salary-payout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE_SIZE = 100;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const CLASSROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

type Policy = {
  id: string;
  classroomId: string;
  payPeriod: string;
  payAnchor: number | null;
  classroom: { teacherId: string };
};

type DuePeriod = { due: boolean; requestKey: string };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function duePeriod(policy: Policy, now: Date): DuePeriod {
  // KST has no daylight-saving transitions, so shifting once and reading UTC
  // fields gives deterministic calendar values on every server timezone.
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const monthIndex = kst.getUTCMonth();
  const day = kst.getUTCDate();

  if (policy.payPeriod === "daily") {
    return {
      due: true,
      requestKey: `role-salary:auto:daily:${dateKey(year, monthIndex, day)}`,
    };
  }

  if (policy.payPeriod === "weekly") {
    const anchor = policy.payAnchor ?? 1;
    if (!Number.isInteger(anchor) || anchor < 1 || anchor > 7) {
      throw new Error("invalid weekly role salary policy");
    }
    const weekday = kst.getUTCDay() === 0 ? 7 : kst.getUTCDay();
    const weekStart = new Date(Date.UTC(year, monthIndex, day - (weekday - 1)));
    return {
      due: weekday === anchor,
      requestKey: `role-salary:auto:weekly:${dateKey(
        weekStart.getUTCFullYear(),
        weekStart.getUTCMonth(),
        weekStart.getUTCDate(),
      )}`,
    };
  }

  if (policy.payPeriod === "monthly") {
    const anchor = policy.payAnchor ?? 1;
    if (!Number.isInteger(anchor) || anchor < 1 || anchor > 31) {
      throw new Error("invalid monthly role salary policy");
    }
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    return {
      due: day === Math.min(anchor, lastDay),
      requestKey: `role-salary:auto:monthly:${year}-${pad(monthIndex + 1)}`,
    };
  }

  throw new Error("invalid role salary pay period");
}

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const classroomIdParam = new URL(req.url).searchParams.get("classroomId");
  const classroomId = classroomIdParam?.trim() || undefined;
  if (classroomIdParam !== null && (!classroomId || !CLASSROOM_ID_PATTERN.test(classroomId))) {
    return NextResponse.json({ error: "invalid_classroom_id" }, { status: 400 });
  }

  const summary = {
    classroomId: classroomId ?? null,
    scanned: 0,
    due: 0,
    paid: 0,
    paidRoles: 0,
    paidStudents: 0,
    totalAmount: 0,
    skipped: 0,
    failed: 0,
  };
  const now = new Date();
  let cursor: string | undefined;

  while (true) {
    const policies = await db.classroomRolePayPolicy.findMany({
      where: {
        payMode: "auto",
        ...(classroomId ? { classroomId } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        classroomId: true,
        payPeriod: true,
        payAnchor: true,
        classroom: { select: { teacherId: true } },
      },
    });

    for (const policy of policies) {
      summary.scanned += 1;

      try {
        const period = duePeriod(policy, now);
        if (!period.due) {
          summary.skipped += 1;
          continue;
        }

        summary.due += 1;
        const result = await payClassroomRoleSalaries({
          classroomId: policy.classroomId,
          performedById: policy.classroom.teacherId,
          requestKey: period.requestKey,
        });
        summary.paid += 1;
        summary.paidRoles += result.paidRoles;
        summary.paidStudents += result.paidStudents;
        summary.totalAmount += result.totalAmount;
      } catch (error) {
        if (
          error instanceof RoleSalaryPayoutError &&
          (error.code === "already_applied" || error.code === "no_assignees")
        ) {
          summary.skipped += 1;
          continue;
        }
        console.error("[role-salary-payout] classroom payout failed", {
          classroomId: policy.classroomId,
          error,
        });
        summary.failed += 1;
      }
    }

    if (policies.length < PAGE_SIZE) break;
    cursor = policies[policies.length - 1].id;
  }

  return NextResponse.json(
    { ok: summary.failed === 0, ...summary },
    { status: summary.failed === 0 ? 200 : 500 },
  );
}
