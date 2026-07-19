import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getCurrentStudent } from "@/lib/student-auth";
import { getWalkingDayRange, isValidWalkingDay } from "@/lib/walking";
import { awardWalkingMilestones } from "@/lib/pets/rewards";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const walkingRowSchema = z.object({
  day: z.string().refine(isValidWalkingDay, { message: "invalid_day" }),
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

async function readRows(studentId: string, days: number) {
  const rows = await db.$queryRaw<RawWalkingRow[]>(Prisma.sql`
    SELECT
      "day",
      "steps",
      "distanceMeters",
      "syncedAt"
    FROM "StudentWalkingDailyStat"
    WHERE "studentId" = ${studentId}
      AND "day" >= ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - (${days - 1})::int)
      AND "day" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date
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
      return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
    }

    const days = parseDays(request);
    return jsonPrivateNoStore({ rows: await readRows(student.id, days) });
  } catch (error) {
    console.error("[GET /api/student/walking]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonPrivateNoStore({ error: "invalid_json" }, { status: 400 });
    }

    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
      return jsonPrivateNoStore(
        { error: "invalid_payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { minDay, maxDay } = getWalkingDayRange();
    const uniqueRows = new Map(parsed.data.rows.map((row) => [row.day, row]));
    const rows = [...uniqueRows.values()];

    if (rows.some((row) => row.day < minDay || row.day > maxDay)) {
      return jsonPrivateNoStore({ error: "day_out_of_range" }, { status: 400 });
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

    if (!isFeatureEnabled("petGame")) {
      return jsonPrivateNoStore({ rows: await readRows(student.id, 31) });
    }

    const rewards = await awardWalkingMilestones(student, rows);
    return jsonPrivateNoStore({ rows: await readRows(student.id, 31), rewards });
  } catch (error) {
    console.error("[POST /api/student/walking]", error);
    return jsonPrivateNoStore({ error: "internal" }, { status: 500 });
  }
}
