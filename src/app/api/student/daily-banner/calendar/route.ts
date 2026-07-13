import "server-only";

import { db } from "@/lib/db";
import { dateToKstDay, kstDayToDate, parseKstDay } from "@/lib/daily-banner";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import {
  getCurrentStudent,
  getCurrentStudentRaw,
} from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

// GET /api/student/daily-banner/calendar?month=YYYY-MM
// Returns only globally occupied publication days. Submission content and
// submitter identity are intentionally never selected or serialized here.
export async function GET(req: Request) {
  // Mobile requests carry an explicit Bearer session token. Respect that
  // token even when the same browser also has a teacher NextAuth session;
  // getCurrentStudent() intentionally gives the teacher session precedence
  // for cookie-based web requests to avoid stale student-cookie attribution.
  const hasBearerToken = /^Bearer\s+/i.test(req.headers.get("authorization") ?? "");
  const student = await (hasBearerToken
    ? getCurrentStudentRaw()
    : getCurrentStudent()
  ).catch(() => null);
  if (!student) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }

  const range = parseMonth(new URL(req.url).searchParams.get("month"));
  if (!range) {
    return jsonPrivateNoStore({ error: "invalid_month" }, { status: 400 });
  }

  try {
    const publications = await db.dailyBannerPublication.findMany({
      where: {
        day: {
          gte: range.firstDay,
          lte: range.lastDay,
        },
      },
      orderBy: { day: "asc" },
      select: { day: true },
    });

    return jsonPrivateNoStore({
      month: range.month,
      occupiedDays: publications.map((publication) =>
        dateToKstDay(publication.day),
      ),
    });
  } catch (error) {
    console.error("[GET /api/student/daily-banner/calendar]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}
