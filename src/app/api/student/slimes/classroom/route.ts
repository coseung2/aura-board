import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { sortClassroomSlimeStudents } from "@/lib/pets/classroom-gallery";
import { getCurrentStudent } from "@/lib/student-auth";
import { walkingTitleForStats, type WalkingTitleStats } from "@/lib/walking-titles";
import type { SlimeColor } from "@/lib/pets/types";

type WalkingAchievementRow = WalkingTitleStats & { studentId: string };

export async function GET() {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [rows, achievementRows] = await Promise.all([
    db.student.findMany({
      where: { classroomId: student.classroomId },
      select: {
        id: true,
        number: true,
        name: true,
        slimes: {
          where: { isRepresentative: true },
          take: 1,
          select: {
            color: true,
            growthStage: true,
            equippedItemKeys: true,
          },
        },
      },
    }),
    db.$queryRaw<WalkingAchievementRow[]>(Prisma.sql`
      WITH daily AS (
        SELECT "studentId", MAX("steps")::bigint AS "maxDailySteps"
        FROM "StudentWalkingDailyStat"
        GROUP BY "studentId"
      ), weekly AS (
        SELECT "studentId", MAX("weeklySteps")::bigint AS "maxWeeklySteps"
        FROM (
          SELECT "studentId", DATE_TRUNC('week', "day") AS "weekStart", SUM("steps")::bigint AS "weeklySteps"
          FROM "StudentWalkingDailyStat"
          GROUP BY "studentId", DATE_TRUNC('week', "day")
        ) totals
        GROUP BY "studentId"
      ), monthly AS (
        SELECT "studentId", MAX("monthlySteps")::bigint AS "maxMonthlySteps"
        FROM (
          SELECT "studentId", DATE_TRUNC('month', "day") AS "monthStart", SUM("steps")::bigint AS "monthlySteps"
          FROM "StudentWalkingDailyStat"
          GROUP BY "studentId", DATE_TRUNC('month', "day")
        ) totals
        GROUP BY "studentId"
      )
      SELECT student."id" AS "studentId",
        COALESCE(daily."maxDailySteps", 0)::bigint AS "maxDailySteps",
        COALESCE(weekly."maxWeeklySteps", 0)::bigint AS "maxWeeklySteps",
        COALESCE(monthly."maxMonthlySteps", 0)::bigint AS "maxMonthlySteps"
      FROM "Student" student
      LEFT JOIN daily ON daily."studentId" = student."id"
      LEFT JOIN weekly ON weekly."studentId" = student."id"
      LEFT JOIN monthly ON monthly."studentId" = student."id"
      WHERE student."classroomId" = ${student.classroomId}
    `),
  ]);
  const titlesByStudent = new Map(
    achievementRows.map((row) => [row.studentId, walkingTitleForStats(row)]),
  );

  const students = sortClassroomSlimeStudents(
    rows.map((row) => ({
      id: row.id,
      number: row.number,
      name: row.name,
      walkingTitle: titlesByStudent.get(row.id) ?? null,
      representative: row.slimes[0]
        ? {
            color: row.slimes[0].color as SlimeColor,
            growthStage: row.slimes[0].growthStage as 1 | 2 | 3,
            equippedItemKeys: row.slimes[0].equippedItemKeys,
          }
        : null,
    })),
  );

  return NextResponse.json({ students });
}
