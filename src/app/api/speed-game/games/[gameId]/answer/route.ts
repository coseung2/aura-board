// POST /api/speed-game/games/[gameId]/answer
//
// 학생 전용. 현재 활성 라운드에 한 번만 답을 등록/업데이트.
// 프론트엔드(SpeedGameBoard.submitAnswer) 가 보내는 body 와 호환:
//   { roundId?, groupId?, answer, elapsedMs? }
//
// exact 모드: 서버에서 즉시 정답 판정 + 점수 계산.
// normalize-space 모드: 공백 제거 후 비교 (정규화 동일 효과 — MVP 에서는
// exact 와 동일 처리).
// teacher-approval 모드: pending 으로 저장(점수 0). 교사 승인은 별도 PATCH
// (이번 스코프 외 — finish 시 accept 시키는 흐름은 추후).

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { limitSpeedGameAnswer } from "@/lib/rate-limit-routes";
import {
  answersMatch,
  computeScore,
  parseBonusRanks,
  rankCorrectAnswers,
} from "@/lib/speed-game/score";
import { resolveStudentGroupId } from "@/lib/speed-game/runtime";

const BodySchema = z
  .object({
    roundId: z.string().min(1).max(64).optional(),
    groupId: z.string().min(1).max(64).optional(),
    answer: z.string().min(1).max(200),
    elapsedMs: z.number().int().min(0).max(600000).optional(),
    rawText: z.string().min(1).max(200).optional(),
  })
  .transform((v) => ({
    text: v.answer ?? v.rawText ?? "",
    roundId: v.roundId,
    groupId: v.groupId,
    elapsedMs: v.elapsedMs,
  }));

type Params = { params: Promise<{ gameId: string }> };

export async function POST(req: Request, { params }: Params) {
  const { gameId } = await params;

  const student = await getCurrentStudent();
  if (!student) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }

  const game = await db.speedGame.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      boardId: true,
      status: true,
      roundIndex: true,
      answerMode: true,
      baseScore: true,
      minScore: true,
      bonusRanks: true,
    },
  });
  if (!game) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  if (game.status !== "running") {
    return jsonPrivateNoStore({ error: "game_not_running" }, { status: 409 });
  }

  // 학생이 보드 학급에 속하는지 검증.
  const board = await db.board.findUnique({
    where: { id: game.boardId },
    select: { classroomId: true },
  });
  if (!board?.classroomId || board.classroomId !== student.classroomId) {
    return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });
  }

  // 학생 모둠 결정.
  const rl = await limitSpeedGameAnswer(`${gameId}:${student.id}`);
  if (!rl.ok) {
    return jsonPrivateNoStore(
      { error: "rate_limited", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const studentGroupId = await resolveStudentGroupId(game.boardId, student.id);
  if (!studentGroupId) {
    return jsonPrivateNoStore({ error: "student_has_no_group" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // 현재 라운드.
  const round = await db.speedGameRound.findFirst({
    where: { gameId, order: game.roundIndex },
    select: {
      id: true,
      keyword: true,
      keywordNormalized: true,
      startedAt: true,
    },
  });
  if (!round || !round.startedAt) {
    return jsonPrivateNoStore({ error: "round_not_active" }, { status: 409 });
  }

  // roundId/groupId 가 명시되면 활성 라운드/학생 모둠 과 일치하는지 확인.
  if (parsed.data.roundId && parsed.data.roundId !== round.id) {
    return jsonPrivateNoStore({ error: "round_mismatch" }, { status: 409 });
  }
  if (parsed.data.groupId && parsed.data.groupId !== studentGroupId) {
    return jsonPrivateNoStore({ error: "group_mismatch" }, { status: 403 });
  }

  const groupId = studentGroupId;
  const rawText = parsed.data.text;
  const now = new Date();
  // 클라이언트가 보낸 elapsedMs 가 있으면 사용, 없으면 서버 계산.
  const elapsedMs =
    typeof parsed.data.elapsedMs === "number"
      ? parsed.data.elapsedMs
      : Math.max(0, now.getTime() - round.startedAt.getTime());

  // 같은 모둠이 이미 답을 제출했으면 update, 아니면 create.
  const existing = await db.speedGameAnswer.findUnique({
    where: { roundId_groupId: { roundId: round.id, groupId } },
    select: { id: true, createdAt: true },
  });

  // 판정: exact / normalize-space 는 자동, teacher-approval 은 pending.
  const isAutoJudge =
    game.answerMode === "exact" || game.answerMode === "normalize-space";
  const isCorrect = isAutoJudge
    ? game.answerMode === "exact"
      ? rawText.trim().toLowerCase() === round.keyword.trim().toLowerCase()
      : answersMatch(round.keywordNormalized, rawText)
    : false;

  // rank 계산: 현재 시점까지 accepted correct 답 수 + 1 (이번 답 포함).
  // teacher-approval 모드에서는 rank=0, score=0 이 MVP 디폴트.
  let score = 0;
  if (isCorrect) {
    const others = await db.speedGameAnswer.findMany({
      where: {
        roundId: round.id,
        correct: true,
        approval: "accepted",
        ...(existing ? { id: { not: existing.id } } : {}),
      },
      select: { id: true, createdAt: true, correct: true },
    });
    const othersRanked = rankCorrectAnswers(
      others.map((g) => ({
        answerId: g.id,
        createdAt: g.createdAt,
        correct: g.correct,
      })),
    );
    const othersRank = othersRanked.size; // 다른 모둠이 맞춘 수
    const bonusRanks = parseBonusRanks(game.bonusRanks);
    score = computeScore({
      correct: true,
      elapsedMs,
      rank: othersRank + 1,
      bonusRanks,
      baseScore: game.baseScore,
      minScore: game.minScore,
    });
  }

  const approval = isCorrect
    ? "accepted"
    : isAutoJudge
      ? "rejected"
      : "pending";

  const upserted = await db.$transaction(async (tx) => {
    const answer = await tx.speedGameAnswer.upsert({
      where: { roundId_groupId: { roundId: round.id, groupId } },
      create: {
        roundId: round.id,
        groupId,
        studentId: student.id,
        correct: isCorrect,
        score,
        approval,
        rawText,
        elapsedMs,
        speedGameId: game.id,
      },
      update: {
        correct: isCorrect,
        score,
        approval,
        rawText,
        elapsedMs,
        speedGameId: game.id,
        // createdAt 은 유지 — 첫 제출 시각 기준.
      },
      select: {
        id: true,
        correct: true,
        score: true,
        approval: true,
        elapsedMs: true,
        createdAt: true,
      },
    });

    await tx.speedGame.update({
      where: { id: game.id },
      data: { updatedAt: now },
      select: { id: true },
    });

    return answer;
  });

  // wire DTO 는 src/components/speed-game/types.ts SpeedGameAnswer 와 일치.
  return jsonPrivateNoStore({
    answer: {
      id: upserted.id,
      roundId: round.id,
      groupId,
      studentId: student.id,
      answer: rawText,
      correct: upserted.correct,
      rank: upserted.correct ? 1 : null, // 채점 후 rank 는 다음 refresh 에서 정확히 채워짐.
      score: upserted.score,
      elapsedMs: upserted.elapsedMs,
      createdAt: upserted.createdAt.toISOString(),
    },
  });
}
