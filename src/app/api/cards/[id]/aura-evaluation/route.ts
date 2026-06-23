/**
 * /api/cards/[id]/aura-evaluation
 *
 * Aura 평가 모드 (2026-06-23) — 카드 단위 상/중/하 등급 upsert.
 *
 *   PUT — teacher owner/editor 만. body = { level: "high" | "mid" | "low" }.
 *
 *   1) board.auraEvaluationEnabled === true 이고
 *      board.auraSubject / auraUnit / auraCriterion 이 모두 non-empty
 *      이어야 한다. 아니면 400.
 *   2) 학생 식별: card.authors (order ASC) 의 첫 행.studentId 를 우선,
 *      없으면 card.studentAuthorId. 둘 다 없으면 400
 *      { error: "student_author_required" }.
 *   3) CardEvaluation upsert (cardId unique). 같은 카드에 다시 등급을
 *      매기면 덮어쓴다.
 *   4) AiFeedback upsert (studentId, subject, unit, criterion unique). 교사
 *      LLM Key 가 필요 없고, model 은 "aura-board:evaluation-mode:v1"
 *      고정 — deterministic 등급 문장이라 LLM 호출 없음.
 *   5) response = { cardId, studentId, level, comment, aiFeedbackId, updatedAt }.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/auth";
import {
  AURA_EVALUATION_MODEL,
  commentForLevel,
  isAuraEvaluationLevel,
} from "@/lib/aura-evaluation";

const Body = z.object({
  level: z.string().refine(isAuraEvaluationLevel, { message: "invalid_level" }),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: cardId } = await params;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const level = parsed.data.level;

  const card = await db.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      boardId: true,
      studentAuthorId: true,
      authors: {
        orderBy: { order: "asc" },
        select: { studentId: true },
        take: 1,
      },
    },
  });
  if (!card) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const board = await db.board.findUnique({
    where: { id: card.boardId },
    select: {
      id: true,
      auraEvaluationEnabled: true,
      auraSubject: true,
      auraUnit: true,
      auraCriterion: true,
    },
  });
  if (!board) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    await requirePermission(board.id, user.id, "edit");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw e;
  }

  if (
    !board.auraEvaluationEnabled ||
    !board.auraSubject ||
    !board.auraUnit ||
    !board.auraCriterion
  ) {
    return NextResponse.json({ error: "evaluation_not_configured" }, { status: 400 });
  }

  const studentId =
    card.authors[0]?.studentId ?? card.studentAuthorId ?? null;
  if (!studentId) {
    return NextResponse.json({ error: "student_author_required" }, { status: 400 });
  }

  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { id: true, classroomId: true },
  });
  if (!student) {
    return NextResponse.json({ error: "student_author_required" }, { status: 400 });
  }

  const comment = commentForLevel(level);
  const subject = board.auraSubject;
  const unit = board.auraUnit;
  const criterion = board.auraCriterion;

  const evaluation = await db.cardEvaluation.upsert({
    where: { cardId: card.id },
    create: {
      boardId: board.id,
      cardId: card.id,
      studentId: student.id,
      teacherId: user.id,
      level,
      comment,
    },
    update: {
      level,
      comment,
      teacherId: user.id,
      studentId: student.id,
    },
  });

  const feedback = await db.aiFeedback.upsert({
    where: {
      studentId_subject_unit_criterion: {
        studentId: student.id,
        subject,
        unit,
        criterion,
      },
    },
    create: {
      teacherId: user.id,
      classroomId: student.classroomId,
      studentId: student.id,
      subject,
      unit,
      criterion,
      comment,
      model: AURA_EVALUATION_MODEL,
    },
    update: {
      comment,
      model: AURA_EVALUATION_MODEL,
      teacherId: user.id,
      classroomId: student.classroomId,
    },
    select: { id: true, updatedAt: true },
  });

  // aiFeedbackId 를 CardEvaluation 에 backlink (옵션, 진단용).
  if (evaluation.aiFeedbackId !== feedback.id) {
    await db.cardEvaluation.update({
      where: { cardId: card.id },
      data: { aiFeedbackId: feedback.id },
    });
  }

  return NextResponse.json({
    cardId: card.id,
    studentId: student.id,
    level,
    comment,
    aiFeedbackId: feedback.id,
    updatedAt: feedback.updatedAt.toISOString(),
  });
}