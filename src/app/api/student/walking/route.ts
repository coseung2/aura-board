import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

const walkingRowSchema = z.object({
  day: z.string().regex(dayPattern),
  steps: z.number().int().min(0).max(200_000),
  distanceMeters: z.number().finite().min(0).max(300_000),
});

const syncSchema = z.object({
  rows: z.array(walkingRowSchema).min(1).max(31),
});

type RawWalkingRow = {
  day: Date | string;
  steps: number;
  distanceMeters: number;
  syncedAt: Date | string;
};

function toDayKey(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function parseDays(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get("days") ?? "7");
  if (!Number.isFinite(raw)) return 7;
  return Math.min(31, Math.max(1, Math.round(raw)));
}

function earliestAllowedDay() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - 30);
  return value.toISOString().slice(0, 10);
}

function latestAllowedDay() {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() + 1);
  return value.toISOString().slice(0, 10);
}

async function readRows(studentId: string, days: number) {
  const rows = await db.$queryRaw<RawWalkingRow[]>(Prisma.sql`
    SELECT
      "day",
      "steps",
      "distanceMeters",
      "syncedAt"
    FROM "StudentWalkingDailyStat"
    WHERE "studentId" = ${studentId}
      AND "day" >= CURRENT_DATE - (${days - 1} * INTERVAL '1 day')
      AND "day" <= CURRENT_DATE
    ORDER BY "day" ASC
  `);

  return rows.map((row) => ({
    day: toDayKey(row.day),
    steps: Number(row.steps) || 0,
    distanceMeters: Number(row.distanceMeters) || 0,
    syncedAt:
      row.syncedAt instanceof Date
        ? row.syncedAt.toISOString()
        : new Date(row.syncedAt).toISOString(),
  }));
}

export async function GET(request: NextRequest) {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const days = parseDays(request);
    return NextResponse.json({ rows: await readRows(student.id, days) });
  } catch (error) {
    console.error("[GET /api/student/walking]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const parsed = syncSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const minDay = earliestAllowedDay();
    const maxDay = latestAllowedDay();
    const uniqueRows = new Map(parsed.data.rows.map((row) => [row.day, row]));
    const rows = [...uniqueRows.values()];

    if (rows.some((row) => row.day < minDay || row.day > maxDay)) {
      return NextResponse.json({ error: "day_out_of_range" }, { status: 400 });
    }

    await db.$transaction(
      rows.map((row) =>
        db.$executeRaw(Prisma.sql`
          INSERT INTO "StudentWalkingDailyStat" (
            "id",
            "studentId",
            "day",
            "steps",
            "distanceMeters",
            "source",
            "syncedAt",
            "createdAt",
            "updatedAt"
          ) VALUES (
            ${randomUUID()},
            ${student.id},
            ${row.day}::date,
            ${row.steps},
            ${Math.round(row.distanceMeters * 100) / 100},
            'health_connect',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
          ON CONFLICT ("studentId", "day") DO UPDATE SET
            "steps" = EXCLUDED."steps",
            "distanceMeters" = EXCLUDED."distanceMeters",
            "source" = EXCLUDED."source",
            "syncedAt" = CURRENT_TIMESTAMP,
            "updatedAt" = CURRENT_TIMESTAMP
        `),
      ),
    );

    return NextResponse.json({ rows: await readRows(student.id, 31) });
  } catch (error) {
    console.error("[POST /api/student/walking]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
