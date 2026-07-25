import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureAccountFor } from "@/lib/bank";
import { getCurrentStudent } from "@/lib/student-auth";
import { getKstClassroomWalkingRankPeriods } from "@/lib/reward-policy";
import { readReadingTitles } from "@/lib/titles";
import {
  evaluateReadingLog,
  type ReadingBookType,
} from "@/lib/reading-evaluator";
import { awardReadingReward, retryReadingRewardTransaction } from "@/lib/avatar-rewards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT_LIMIT = 30;
const MAX_TITLE = 80;
const MAX_AUTHOR = 60;
const MAX_REFLECTION = 600;
const ALLOWED_BOOK_TYPES: ReadingBookType[] = ["comic", "story"];
const TOP_FIVE_LIMIT = 5;

type ClassroomReadingRank = {
  studentId: string;
  studentNumber: number | null;
  studentName: string;
  weeklyCount: number | bigint;
};

/**
 * Weekly reading leaderboard for the student's classroom. The period matches the
 * walking leaderboard so both surfaces reset on the same KST boundary.
 */
async function readClassroomTopFive(
  classroomId: string,
  range: { weekStart: string; weekEnd: string },
  currentStudentId: string,
) {
  // ReadingLog.createdAt is a timestamp, so compare against the KST week
  // boundaries rather than bare dates to avoid counting the wrong day.
  const weekStart = new Date(`${range.weekStart}T00:00:00+09:00`);
  const weekEnd = new Date(`${range.weekEnd}T00:00:00+09:00`);
  const ranks = await db.$queryRaw<ClassroomReadingRank[]>(Prisma.sql`
    SELECT
      student."id" AS "studentId",
      student."number" AS "studentNumber",
      student."name" AS "studentName",
      COUNT(log."id")::bigint AS "weeklyCount"
    FROM "Student" student
    LEFT JOIN "ReadingLog" log
      ON log."studentId" = student."id"
      AND log."classroomId" = ${classroomId}
      AND log."createdAt" >= ${weekStart}
      AND log."createdAt" < ${weekEnd}
    WHERE student."classroomId" = ${classroomId}
    GROUP BY student."id", student."number", student."name"
    ORDER BY "weeklyCount" DESC, student."number" ASC NULLS LAST, student."name" ASC
    LIMIT ${TOP_FIVE_LIMIT}
  `);

  return ranks
    .filter(
      (rank) =>
        typeof rank.studentId === "string" && typeof rank.studentName === "string",
    )
    .map((rank) => ({
      studentId: rank.studentId,
      studentNumber: Number.isInteger(rank.studentNumber) ? rank.studentNumber : null,
      studentName: rank.studentName,
      weeklyCount: Number(rank.weeklyCount) || 0,
      isCurrent: rank.studentId === currentStudentId,
    }));
}

type SerializedReadingLog = {
  id: string;
  classroomId: string;
  studentId: string;
  bookType: ReadingBookType;
  title: string;
  author: string;
  reflection: string;
  aiScore: number | null;
  aiFeedback: string | null;
  evaluatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function serialize(row: {
  id: string;
  classroomId: string;
  studentId: string;
  bookType: string;
  title: string;
  author: string;
  reflection: string;
  aiScore: number | null;
  aiFeedback: string | null;
  evaluatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SerializedReadingLog {
  return {
    id: row.id,
    classroomId: row.classroomId,
    studentId: row.studentId,
    bookType: row.bookType === "comic" ? "comic" : "story",
    title: row.title,
    author: row.author,
    reflection: row.reflection,
    aiScore: row.aiScore,
    aiFeedback: row.aiFeedback,
    evaluatedAt: row.evaluatedAt ? row.evaluatedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function trimmedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function isMissingReadingLogTable(e: unknown): boolean {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = (e as { code?: unknown }).code;
    if (code === "P2021") return true;
  }
  return (
    e instanceof Error &&
    (e.message.includes("ReadingLog") || e.message.includes("readingLog"))
  );
}

export async function GET() {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rankPeriods = getKstClassroomWalkingRankPeriods();
  const emptySummary = {
    weeklyCount: 0,
    totalCount: 0,
    averageScore: null as number | null,
  };

  if (!db.readingLog) {
    return NextResponse.json({
      entries: [],
      count: 0,
      summary: emptySummary,
      weekRange: rankPeriods.active,
      classroomTopFive: [],
      classroomRankNextResetAt: rankPeriods.nextResetAt.toISOString(),
      titles: [],
    });
  }

  let rows: Awaited<ReturnType<typeof db.readingLog.findMany>>;
  let totalCount = 0;
  let weeklyCount = 0;
  let averageScore: number | null = null;
  let classroomTopFive: Awaited<ReturnType<typeof readClassroomTopFive>> = [];
  let titles: Awaited<ReturnType<typeof readReadingTitles>> = [];
  const weekStart = new Date(`${rankPeriods.active.weekStart}T00:00:00+09:00`);
  const weekEnd = new Date(`${rankPeriods.active.weekEnd}T00:00:00+09:00`);
  const readingWhere = {
    studentId: student.id,
    classroomId: student.classroomId,
  };
  try {
    const [recentRows, completeTotalCount, completeWeeklyCount, scoreAggregate] =
      await Promise.all([
        db.readingLog.findMany({
          where: readingWhere,
          orderBy: { createdAt: "desc" },
          take: RECENT_LIMIT,
        }),
        db.readingLog.count({ where: readingWhere }),
        db.readingLog.count({
          where: {
            ...readingWhere,
            createdAt: { gte: weekStart, lt: weekEnd },
          },
        }),
        db.readingLog.aggregate({
          where: readingWhere,
          _avg: { aiScore: true },
        }),
      ]);
    rows = recentRows;
    totalCount = completeTotalCount;
    weeklyCount = completeWeeklyCount;
    const rawAverageScore = scoreAggregate._avg.aiScore;
    averageScore =
      rawAverageScore === null
        ? null
        : Math.round(rawAverageScore * 10) / 10;
    classroomTopFive = await readClassroomTopFive(
      student.classroomId,
      rankPeriods.active,
      student.id,
    );
    titles = await readReadingTitles(student.id);
  } catch (e) {
    if (!isMissingReadingLogTable(e)) throw e;
    rows = [];
    classroomTopFive = [];
    titles = [];
  }

  const entries = rows.map(serialize);

  return NextResponse.json({
    entries,
    count: totalCount,
    summary: { weeklyCount, totalCount, averageScore },
    weekRange: rankPeriods.active,
    classroomTopFive,
    classroomRankNextResetAt: rankPeriods.nextResetAt.toISOString(),
    titles,
  });
}

export async function POST(req: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  const bookTypeRaw = trimmedString(raw.bookType, 16);
  if (
    !bookTypeRaw ||
    !ALLOWED_BOOK_TYPES.includes(bookTypeRaw as ReadingBookType)
  ) {
    return NextResponse.json(
      {
        error: "invalid_book_type",
        message:
          "\ucc45 \uc885\ub958\ub97c \ub9cc\ud654\ucc45 \ub610\ub294 \uc774\uc57c\uae30\ucc45\uc73c\ub85c \uace8\ub77c \uc8fc\uc138\uc694.",
      },
      { status: 400 },
    );
  }

  const title = trimmedString(raw.title, MAX_TITLE);
  if (!title) {
    return NextResponse.json(
      {
        error: "title_required",
        message: "\ucc45 \uc81c\ubaa9\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694.",
      },
      { status: 400 },
    );
  }

  const author = trimmedString(raw.author, MAX_AUTHOR);
  if (!author) {
    return NextResponse.json(
      {
        error: "author_required",
        message: "\uc9c0\uc740\uc774\ub97c \uc785\ub825\ud574 \uc8fc\uc138\uc694.",
      },
      { status: 400 },
    );
  }

  const reflection = trimmedString(raw.reflection, MAX_REFLECTION);
  if (!reflection) {
    return NextResponse.json(
      {
        error: "reflection_required",
        message:
          "\ub290\ub080 \uc810\uc744 \ud55c \ubb38\uc7a5 \uc774\uc0c1 \uc801\uc5b4 \uc8fc\uc138\uc694.",
      },
      { status: 400 },
    );
  }

  const bookType = bookTypeRaw as ReadingBookType;
  const evaluation = evaluateReadingLog({ bookType, title, author, reflection });
  const { accountId } = await ensureAccountFor(student);
  let created: Awaited<ReturnType<typeof db.readingLog.create>>;
  let reward: { amount: number; unitLabel: string } | null;
  try {
    const result = await retryReadingRewardTransaction(() =>
      db.$transaction(async (tx) => {
        const readingLog = await tx.readingLog.create({
          data: {
            classroomId: student.classroomId,
            studentId: student.id,
            bookType,
            title,
            author,
            reflection,
            aiScore: evaluation.score,
            aiFeedback: evaluation.feedback,
            evaluatedAt: new Date(),
          },
        });
        const readingReward = await awardReadingReward({
          tx,
          accountId,
          student,
          score: readingLog.aiScore,
          readingLogId: readingLog.id,
        });
        return { created: readingLog, reward: readingReward };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    );
    created = result.created;
    reward = result.reward;
  } catch (e) {
    if (!isMissingReadingLogTable(e)) throw e;
    return NextResponse.json(
      {
        error: "reading_log_not_ready",
        message:
          "\ub3c5\uc11c \uae30\ub85d \uc800\uc7a5 \uc900\ube44\uac00 \uc544\uc9c1 \ub05d\ub098\uc9c0 \uc54a\uc558\uc5b4\uc694.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ entry: serialize(created), reward }, { status: 201 });
}
