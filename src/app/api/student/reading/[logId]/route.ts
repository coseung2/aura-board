import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import type { ReadingBookType } from "@/lib/reading-evaluator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TITLE = 80;
const MAX_AUTHOR = 60;
const MAX_REFLECTION = 600;
const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_BOOK_TYPES: ReadingBookType[] = ["comic", "story"];

type RouteContext = { params: Promise<{ logId: string }> };

function trimmedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

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
  aiFeedbackStatus: string;
  aiFeedbackModel: string | null;
  aiFeedbackError: string | null;
  evaluatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  currentRevision: number;
}) {
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
    aiFeedbackStatus: row.aiFeedbackStatus,
    aiFeedbackModel: row.aiFeedbackModel,
    aiFeedbackError: row.aiFeedbackError,
    evaluatedAt: row.evaluatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    currentRevision: row.currentRevision,
  };
}

function validationError(error: string, message: string) {
  return NextResponse.json({ error, message }, { status: 400 });
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const student = await getCurrentStudent();
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { logId } = await params;
  const log = await db.readingLog.findFirst({
    where: { id: logId, studentId: student.id, classroomId: student.classroomId },
  });
  if (!log) return NextResponse.json({ error: "reading_log_not_found" }, { status: 404 });

  if (log.createdAt.getTime() < Date.now() - EDIT_WINDOW_MS) {
    return NextResponse.json(
      { error: "reading_log_edit_window_expired", message: "독서 기록은 작성 후 7일 동안만 수정할 수 있어요." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const raw = body as Record<string, unknown>;
  const bookTypeRaw = trimmedString(raw.bookType, 16);
  if (!bookTypeRaw || !ALLOWED_BOOK_TYPES.includes(bookTypeRaw as ReadingBookType)) {
    return validationError("invalid_book_type", "책 종류를 만화책 또는 이야기책으로 골라 주세요.");
  }
  const title = trimmedString(raw.title, MAX_TITLE);
  if (!title) return validationError("title_required", "책 제목을 입력해 주세요.");
  const author = trimmedString(raw.author, MAX_AUTHOR);
  if (!author) return validationError("author_required", "지은이를 입력해 주세요.");
  const reflection = trimmedString(raw.reflection, MAX_REFLECTION);
  if (!reflection) return validationError("reflection_required", "느낀 점을 한 문장 이상 적어 주세요.");

  const updated = await db.$transaction(async (tx) => {
    await tx.readingLogRevision.create({
      data: {
        logId: log.id,
        revision: log.currentRevision,
        bookType: log.bookType,
        title: log.title,
        author: log.author,
        reflection: log.reflection,
        aiScore: log.aiScore,
        aiFeedback: log.aiFeedback,
        aiFeedbackStatus: log.aiFeedbackStatus,
        evaluatedAt: log.evaluatedAt,
      },
    });
    return tx.readingLog.update({
      where: { id: log.id },
      data: {
        bookType: bookTypeRaw,
        title,
        author,
        reflection,
        currentRevision: { increment: 1 },
        aiScore: null,
        aiFeedback: null,
        aiFeedbackStatus: "pending",
        aiFeedbackModel: null,
        aiFeedbackError: null,
        evaluatedAt: null,
      },
    });
  });

  return NextResponse.json({ entry: serialize(updated) });
}
