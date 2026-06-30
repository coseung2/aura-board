// GET /api/external/feedbacks
//
// 두 인증 모드 동시 지원 (OAuth 마이그레이션 전환기):
//   1) Bearer <auratea_*>  — 교사 OAuth access token. 토큰 → User → 그 교사
//      소유 학급들 응답. classroomCode 옵션 (없으면 전체, 있으면 추가 필터).
//   2) Bearer <AURA_BRIDGE_TOKEN> — legacy shared-secret. classroomCode 필수.
//      응답에 Deprecation/Sunset 헤더 동봉.
//
// flat 배열 — row 1개 = JSON 1개. id 가 Aura 측 art_comment_drafts.aura_board_ref_id
// UNIQUE 키. 정렬 updatedAt DESC.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  resolveAuraBridgeAuth,
  deniedResponse,
  bridgeDeprecationHeaders,
} from "@/lib/aura-bridge-auth";
import {
  isAuraEvaluationLevel,
  type AuraEvaluationLevel,
} from "@/lib/aura-evaluation";

async function getEvaluationLevelsByFeedbackId(
  feedbackIds: string[],
): Promise<Map<string, AuraEvaluationLevel>> {
  if (feedbackIds.length === 0) return new Map();

  const rows = await db.cardEvaluation.findMany({
    where: { aiFeedbackId: { in: feedbackIds } },
    orderBy: { updatedAt: "desc" },
    select: {
      aiFeedbackId: true,
      level: true,
    },
  });

  const levels = new Map<string, AuraEvaluationLevel>();
  for (const row of rows) {
    if (!row.aiFeedbackId || levels.has(row.aiFeedbackId)) continue;
    if (isAuraEvaluationLevel(row.level)) {
      levels.set(row.aiFeedbackId, row.level);
    }
  }
  return levels;
}

export async function GET(req: Request) {
  const auth = await resolveAuraBridgeAuth(req);
  if (auth.mode === "denied") return deniedResponse(auth.reason);

  const url = new URL(req.url);
  const classroomCode = url.searchParams.get("classroomCode");

  // ── OAuth path: token → teacher → owned classrooms (+optional filter) ──
  if (auth.mode === "oauth") {
    if (!auth.scope.split(/\s+/).includes("external:read")) {
      return NextResponse.json({ error: "insufficient_scope" }, { status: 403 });
    }
    const where: { teacherId: string; code?: string } = { teacherId: auth.teacherId };
    if (classroomCode) where.code = classroomCode;
    const classrooms = await db.classroom.findMany({
      where,
      select: { id: true, code: true },
    });
    if (classrooms.length === 0) return NextResponse.json({ feedbacks: [] });

    const rows = await db.aiFeedback.findMany({
      where: { classroomId: { in: classrooms.map((c) => c.id) } },
      orderBy: { updatedAt: "desc" },
      include: {
        student: { select: { number: true, name: true } },
        classroom: { select: { code: true } },
      },
    });
    const levels = await getEvaluationLevelsByFeedbackId(rows.map((r) => r.id));
    return NextResponse.json({
      feedbacks: rows.map((r) => ({
        id: r.id,
        classroomCode: r.classroom.code,
        studentNumber: r.student.number,
        studentName: r.student.name,
        subject: r.subject,
        unit: r.unit,
        criterion: r.criterion,
        comment: r.comment,
        level: levels.get(r.id) ?? null,
        model: r.model,
        sentAt: r.updatedAt.toISOString(),
      })),
    });
  }

  // ── Legacy bridge path: classroomCode 필수, no ownership ──
  if (!classroomCode) {
    return NextResponse.json({ error: "classroomCode required" }, { status: 400 });
  }
  const classroom = await db.classroom.findUnique({
    where: { code: classroomCode },
    select: { id: true, code: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "classroom_not_found" }, { status: 404 });
  }
  const rows = await db.aiFeedback.findMany({
    where: { classroomId: classroom.id },
    orderBy: { updatedAt: "desc" },
    include: { student: { select: { number: true, name: true } } },
  });
  const levels = await getEvaluationLevelsByFeedbackId(rows.map((r) => r.id));
  return NextResponse.json(
    {
      feedbacks: rows.map((r) => ({
        id: r.id,
        classroomCode: classroom.code,
        studentNumber: r.student.number,
        studentName: r.student.name,
        subject: r.subject,
        unit: r.unit,
        criterion: r.criterion,
        comment: r.comment,
        level: levels.get(r.id) ?? null,
        model: r.model,
        sentAt: r.updatedAt.toISOString(),
      })),
    },
    { headers: bridgeDeprecationHeaders() }
  );
}
