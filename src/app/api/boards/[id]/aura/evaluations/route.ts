/**
 * /api/boards/[id]/aura/evaluations
 *
 * Aura 평가 모드 (2026-06-23) — 보드의 카드별 등급 캐시 목록 조회.
 *
 *   GET — teacher owner/editor 만. 보드의 모든 CardEvaluation 을
 *         { cardId, studentId, level, comment, aiFeedbackId, updatedAt }
 *         배열로 반환. Aura 측은 보지 않는다 (Aura 는 AiFeedback 만 본다).
 *         보드 설정 UI 가 "어떤 카드가 이미 평가됐는지" 를 한 번에 그릴 때
 *         사용.
 *
 *   POST — teacher owner/editor 만. body = { subject, unit, criterion }.
 *          보드에 임시 저장된 CardEvaluation 을 선택한 평가계획에 매핑하고
 *          AiFeedback 으로 upsert 한다. 이 시점부터 Aura 가 external
 *          feedbacks API 로 결과를 가져갈 수 있다.
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

const MAX_LEN = 300;

const SendBody = z.object({
  subject: z.string().trim().min(1).max(MAX_LEN),
  unit: z.string().trim().min(1).max(MAX_LEN),
  criterion: z.string().trim().min(1).max(MAX_LEN),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: boardIdOrSlug } = await params;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: { id: true },
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

  const rows = await db.cardEvaluation.findMany({
    where: { boardId: board.id },
    orderBy: { updatedAt: "desc" },
    select: {
      cardId: true,
      studentId: true,
      level: true,
      comment: true,
      aiFeedbackId: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    evaluations: rows.map((r) => ({
      cardId: r.cardId,
      studentId: r.studentId,
      level: r.level,
      comment: r.comment,
      aiFeedbackId: r.aiFeedbackId,
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: boardIdOrSlug } = await params;

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
  const parsed = SendBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { subject, unit, criterion } = parsed.data;

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: { id: true, auraEvaluationEnabled: true },
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

  if (!board.auraEvaluationEnabled) {
    return NextResponse.json({ error: "evaluation_not_enabled" }, { status: 400 });
  }

  const rows = await db.cardEvaluation.findMany({
    where: { boardId: board.id },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      cardId: true,
      studentId: true,
      level: true,
      comment: true,
      updatedAt: true,
      student: { select: { classroomId: true } },
    },
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: "no_evaluations" }, { status: 400 });
  }

  // AiFeedback is unique per student + subject + unit + criterion. If a student
  // has multiple evaluated cards on this board, the most recently updated
  // card is the one sent for this evaluation item.
  const latestByStudent = new Map<string, (typeof rows)[number]>();
  for (const row of rows) latestByStudent.set(row.studentId, row);
  const selectedRows = [...latestByStudent.values()];

  const sent = await db.$transaction(async (tx) => {
    await tx.board.update({
      where: { id: board.id },
      data: {
        auraSubject: subject,
        auraUnit: unit,
        auraCriterion: criterion,
      },
    });

    const results: Array<{
      cardId: string;
      studentId: string;
      aiFeedbackId: string;
      updatedAt: string;
    }> = [];

    for (const row of selectedRows) {
      if (!isAuraEvaluationLevel(row.level)) continue;
      const comment = row.comment ?? commentForLevel(row.level);
      const feedback = await tx.aiFeedback.upsert({
        where: {
          studentId_subject_unit_criterion: {
            studentId: row.studentId,
            subject,
            unit,
            criterion,
          },
        },
        create: {
          teacherId: user.id,
          classroomId: row.student.classroomId,
          studentId: row.studentId,
          subject,
          unit,
          criterion,
          comment,
          model: AURA_EVALUATION_MODEL,
        },
        update: {
          teacherId: user.id,
          classroomId: row.student.classroomId,
          comment,
          model: AURA_EVALUATION_MODEL,
        },
        select: { id: true, updatedAt: true },
      });

      await tx.cardEvaluation.update({
        where: { id: row.id },
        data: { aiFeedbackId: feedback.id },
      });

      results.push({
        cardId: row.cardId,
        studentId: row.studentId,
        aiFeedbackId: feedback.id,
        updatedAt: feedback.updatedAt.toISOString(),
      });
    }

    return results;
  });

  if (sent.length === 0) {
    return NextResponse.json({ error: "no_valid_evaluations" }, { status: 400 });
  }

  return NextResponse.json({
    sentCount: sent.length,
    evaluationCount: rows.length,
    subject,
    unit,
    criterion,
    feedbacks: sent,
  });
}
