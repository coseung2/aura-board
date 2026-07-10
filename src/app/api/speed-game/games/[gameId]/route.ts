// GET /api/speed-game/games/[gameId]
// PATCH /api/speed-game/games/[gameId]
//
// 교사(컨트롤러) + 학급 학생(플레이어) 모두 같은 DTO 를 받는다.
// PATCH 는 교사 전용 — action: "start" | "next" | "finish".

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import {
  authenticateGameViewer,
  loadGameSnapshot,
} from "@/lib/speed-game/runtime";
import { sanitizeGameSnapshotForStudent } from "@/lib/speed-game/student-snapshot";

type Params = { params: Promise<{ gameId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { gameId } = await params;
  const game = await db.speedGame.findUnique({
    where: { id: gameId },
    select: { boardId: true },
  });
  if (!game) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  const auth = await authenticateGameViewer(game.boardId);
  if (auth.kind === "unauthorized") {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }
  const snap = await loadGameSnapshot(gameId);
  if (!snap) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  return jsonPrivateNoStore({
    game:
      auth.kind === "student"
        ? sanitizeGameSnapshotForStudent(snap, auth.studentId)
        : snap,
  });
}

const PatchSchema = z.object({
  action: z.enum(["start", "next", "finish"]),
});

export async function PATCH(req: Request, { params }: Params) {
  const { gameId } = await params;
  const game = await db.speedGame.findUnique({
    where: { id: gameId },
    select: { boardId: true, status: true, roundIndex: true },
  });
  if (!game) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  const auth = await authenticateGameViewer(game.boardId);
  if (auth.kind !== "teacher" || (auth.role !== "owner" && auth.role !== "editor")) {
    return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const now = new Date();

  // start: lobby → running, roundIndex=0, 라운드0 startedAt 설정.
  if (parsed.data.action === "start") {
    if (game.status !== "lobby") {
      return jsonPrivateNoStore({ error: "not_in_lobby" }, { status: 409 });
    }
    await db.$transaction(async (tx) => {
      const firstRound = await tx.speedGameRound.findFirst({
        where: { gameId },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      if (!firstRound) {
        throw new Error("no_rounds");
      }
      await tx.speedGameRound.update({
        where: { id: firstRound.id },
        data: { startedAt: now },
      });
      await tx.speedGame.update({
        where: { id: gameId },
        data: { status: "running", roundIndex: 0, activeStartedAt: now },
      });
    });
  } else if (parsed.data.action === "next") {
    if (game.status !== "running") {
      return jsonPrivateNoStore({ error: "not_running" }, { status: 409 });
    }
    // 현재 라운드 endedAt + 채점(accept 미정답은 정답 처리하지 않음).
    // teacher-approval 모드에서 미승인 답은 correct=false 유지.
    const nextIndex = game.roundIndex + 1;
    const updated = await db.$transaction(async (tx) => {
      // 1) 현재 라운드 종료.
      const current = await tx.speedGameRound.findFirst({
        where: { gameId, order: game.roundIndex },
        select: { id: true, startedAt: true, endedAt: true },
      });
      if (current && !current.endedAt) {
        await tx.speedGameRound.update({
          where: { id: current.id },
          data: { endedAt: now },
        });
      }
      // 2) 다음 라운드 존재 여부.
      const nextRound = await tx.speedGameRound.findFirst({
        where: { gameId, order: nextIndex },
        select: { id: true },
      });
      if (nextRound) {
        await tx.speedGameRound.update({
          where: { id: nextRound.id },
          data: { startedAt: now },
        });
        await tx.speedGame.update({
          where: { id: gameId },
          data: { roundIndex: nextIndex, activeStartedAt: now },
        });
      } else {
        // 마지막 라운드였으면 게임 종료.
        await tx.speedGame.update({
          where: { id: gameId },
          data: { status: "finished", activeStartedAt: null },
        });
      }
    });
    // updated 는 사용하지 않음.
    void updated;
  } else if (parsed.data.action === "finish") {
    if (game.status === "finished") {
      return jsonPrivateNoStore({ error: "already_finished" }, { status: 409 });
    }
    await db.$transaction(async (tx) => {
      // 모든 running 라운드 종료.
      await tx.speedGameRound.updateMany({
        where: { gameId, endedAt: null },
        data: { endedAt: now },
      });
      await tx.speedGame.update({
        where: { id: gameId },
        data: { status: "finished", activeStartedAt: null },
      });
    });
  }

  // 직전 라운드의 점수는 accept 시점에 이미 계산되어 있다. 별도 finalize
  // 단계 없이 finished 상태로 둔다.
  const snap = await loadGameSnapshot(gameId);
  if (!snap) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  return jsonPrivateNoStore({ game: snap });
}
