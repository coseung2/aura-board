import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getKstDay,
  kstDayToDate,
  parseKstDay,
  serializeDailyBannerSubmission,
} from "@/lib/daily-banner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
};

const MONTH_RE = /^(\d{4})-(\d{2})$/;

type MonthRange = {
  month: string;
  firstDay: Date;
  lastDay: Date;
};

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseMonth(value: string | null): MonthRange | null {
  if (!value) return null;
  const month = value.trim();
  const match = MONTH_RE.exec(month);
  if (!match) return null;

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return null;
  }

  const firstDay = parseKstDay(`${month}-01`);
  const lastDay = parseKstDay(
    `${month}-${String(daysInMonth(year, monthNumber)).padStart(2, "0")}`,
  );
  if (!firstDay || !lastDay) return null;

  return {
    month: firstDay.slice(0, 7),
    firstDay: kstDayToDate(firstDay),
    lastDay: kstDayToDate(lastDay),
  };
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}
// GET /api/classrooms/:id/daily-banners?targetDay=YYYY-MM-DD&status=pending
// GET /api/classrooms/:id/daily-banners?month=YYYY-MM&status=all
// Teacher-only moderation queue for one classroom and one KST target day/month.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { id: classroomId } = await params;
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { id: true, teacherId: true },
  });
  if (!classroom) return json({ error: "not_found" }, 404);
  if (classroom.teacherId !== user.id) return json({ error: "forbidden" }, 403);

  const query = new URL(req.url).searchParams;
  const monthValue = query.get("month");
  const month = parseMonth(monthValue);
  if (monthValue !== null && !month) {
    return json({ error: "invalid_month" }, 400);
  }
  const targetDay = month
    ? null
    : parseKstDay(query.get("targetDay") ?? query.get("day") ?? getKstDay());
  if (!month && !targetDay) return json({ error: "invalid_day" }, 400);

  const statusValue = query.get("status") ?? "pending";
  if (!["all", "pending", "approved", "rejected"].includes(statusValue)) {
    return json({ error: "invalid_status" }, 400);
  }

  const submissions = await db.dailyBannerSubmission.findMany({
    where: {
      classroomId,
      targetDay: month
        ? { gte: month.firstDay, lte: month.lastDay }
        : kstDayToDate(targetDay as string),
      ...(statusValue === "all"
        ? {}
        : { status: statusValue as "pending" | "approved" | "rejected" }),
    },
    include: {
      student: { select: { id: true, name: true, number: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return json({
    classroomId,
    month: month?.month ?? targetDay?.slice(0, 7),
    targetDay,
    status: statusValue,
    submissions: submissions.map(serializeDailyBannerSubmission),
  });
}
