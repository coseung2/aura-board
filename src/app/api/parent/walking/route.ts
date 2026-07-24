import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { addWalkingDays, getWalkingDayKey } from "@/lib/walking";
import { withParentScope } from "@/lib/parent-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DateValue = Date | string;

type WalkingStatRow = {
  studentId: string;
  day: DateValue;
  steps: number;
  distanceMeters: number;
  syncedAt: DateValue | null;
};

function getCurrentKstWeek() {
  const today = getWalkingDayKey();
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const weekStart = addWalkingDays(today, -daysSinceMonday);

  return {
    weekStart,
    weekEnd: addWalkingDays(weekStart, 6),
    today,
  };
}

function dayToDate(day: string) {
  return new Date(`${day}T00:00:00.000Z`);
}

function serializeDay(value: DateValue) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function serializeSyncedAt(value: DateValue | null) {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(req: Request) {
  return withParentScope(req, async (ctx) => {
    const week = getCurrentKstWeek();
    const studentIds = ctx.childLinks.map((link) => link.studentId);

    if (studentIds.length === 0) {
      return NextResponse.json({ week, children: [] });
    }

    const [students, stats] = await Promise.all([
      db.student.findMany({
        where: { id: { in: studentIds } },
        select: {
          id: true,
          name: true,
          number: true,
          classroom: { select: { id: true, name: true } },
        },
      }),
      db.studentWalkingDailyStat.findMany({
        where: {
          studentId: { in: studentIds },
          day: {
            gte: dayToDate(week.weekStart),
            lte: dayToDate(week.today),
          },
        },
        select: {
          studentId: true,
          day: true,
          steps: true,
          distanceMeters: true,
          syncedAt: true,
        },
        orderBy: [{ studentId: "asc" }, { day: "asc" }],
      }),
    ]);

    const studentsById = new Map(students.map((student) => [student.id, student]));
    const statsByStudent = new Map<string, WalkingStatRow[]>();
    for (const studentId of studentIds) statsByStudent.set(studentId, []);

    for (const stat of stats as WalkingStatRow[]) {
      const day = serializeDay(stat.day);
      if (day < week.weekStart || day > week.today) continue;
      statsByStudent.get(stat.studentId)?.push(stat);
    }

    const children = ctx.childLinks
      .map((link) => {
        const student = studentsById.get(link.studentId);
        if (!student) return null;

        const rows = (statsByStudent.get(link.studentId) ?? [])
          .slice()
          .sort((left, right) => serializeDay(left.day).localeCompare(serializeDay(right.day)))
          .map((row) => ({
            day: serializeDay(row.day),
            steps: row.steps,
            distanceMeters: row.distanceMeters,
            syncedAt: serializeSyncedAt(row.syncedAt),
          }));

        return {
          studentId: student.id,
          name: student.name,
          number: student.number,
          classroom: student.classroom,
          rows,
        };
      })
      .filter((child): child is NonNullable<typeof child> => child !== null);

    return NextResponse.json({ week, children });
  });
}
