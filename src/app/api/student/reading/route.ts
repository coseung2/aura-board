import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  evaluateReadingLog,
  type ReadingBookType,
} from "@/lib/reading-evaluator";
import { awardReadingReward } from "@/lib/avatar-rewards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT_LIMIT = 30;
const MAX_TITLE = 80;
const MAX_AUTHOR = 60;
const MAX_REFLECTION = 600;
const ALLOWED_BOOK_TYPES: ReadingBookType[] = ["comic", "story"];

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

  if (!db.readingLog) {
    return NextResponse.json({ entries: [], count: 0 });
  }

  let rows: Awaited<ReturnType<typeof db.readingLog.findMany>>;
  try {
    rows = await db.readingLog.findMany({
      where: { studentId: student.id, classroomId: student.classroomId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
    });
  } catch (e) {
    if (!isMissingReadingLogTable(e)) throw e;
    rows = [];
  }

  const entries = rows.map(serialize);
  return NextResponse.json({ entries, count: entries.length });
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
  let created: Awaited<ReturnType<typeof db.readingLog.create>>;
  try {
    created = await db.readingLog.create({
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

  // Award avatar/wallet reward if the reading log qualifies. The helper
  // is intentionally fire-and-forget: a reward failure must not roll back
  // the log entry the student just submitted.
  let reward: { amount: number; unitLabel: string } | null = null;
  try {
    reward = await awardReadingReward({
      student,
      score: created.aiScore,
      readingLogId: created.id,
    });
  } catch (e) {
    console.error("[reading] reward hook failed", e);
  }

  return NextResponse.json({ entry: serialize(created), reward }, { status: 201 });
}
