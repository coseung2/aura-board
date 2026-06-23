/**
 * /api/boards/[id]/aura
 *
 * Aura 평가 모드 (2026-06-23) — 보드 단위 토글/평가 기준 식별자 조회·변경.
 *
 *   GET   — teacher owner/editor 만. 보드의 auraEvaluationEnabled /
 *           auraSubject / auraUnit / auraCriterion 을 반환.
 *   PATCH — teacher owner/editor 만. 위 4개 필드 중 변경할 것만 보낸다.
 *           string 필드는 trim, 빈 문자열은 null 로 normalize.
 *
 * Aura 측은 이 라우트의 응답을 보지 않는다 — 진실은 AiFeedback 이고
 * /api/external/feedbacks 가 그대로 끌어간다. 이 라우트는 Aura-board
 * (보드 설정 UI) 의 GET/PATCH 용.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/auth";

const MAX_LEN = 120;

const PatchBody = z.object({
  evaluationEnabled: z.boolean().optional(),
  subject: z.string().max(MAX_LEN).nullable().optional(),
  unit: z.string().max(MAX_LEN).nullable().optional(),
  criterion: z.string().max(MAX_LEN).nullable().optional(),
});

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const { id: boardIdOrSlug } = await params;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
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

  return NextResponse.json({
    evaluationEnabled: board.auraEvaluationEnabled,
    subject: board.auraSubject,
    unit: board.auraUnit,
    criterion: board.auraCriterion,
  });
}

export async function PATCH(req: Request, { params }: RouteContext) {
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
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
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

  const subject = normalizeNullableString(parsed.data.subject);
  const unit = normalizeNullableString(parsed.data.unit);
  const criterion = normalizeNullableString(parsed.data.criterion);

  const data: {
    auraEvaluationEnabled?: boolean;
    auraSubject?: string | null;
    auraUnit?: string | null;
    auraCriterion?: string | null;
  } = {};
  if (parsed.data.evaluationEnabled !== undefined) {
    data.auraEvaluationEnabled = parsed.data.evaluationEnabled;
  }
  if (subject !== undefined) data.auraSubject = subject;
  if (unit !== undefined) data.auraUnit = unit;
  if (criterion !== undefined) data.auraCriterion = criterion;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  const updated = await db.board.update({
    where: { id: board.id },
    data,
    select: {
      id: true,
      auraEvaluationEnabled: true,
      auraSubject: true,
      auraUnit: true,
      auraCriterion: true,
    },
  });

  return NextResponse.json({
    evaluationEnabled: updated.auraEvaluationEnabled,
    subject: updated.auraSubject,
    unit: updated.auraUnit,
    criterion: updated.auraCriterion,
  });
}