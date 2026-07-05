// GET /api/speed-game/games/[gameId]/stream
//
// 스피드게임 라이브 동기화. status/roundIndex/answers/leaderboard 가 변할 때만
// push. 학생 호출자도 같은 채널. teacher-only 액션(점수 accept 등)은 다른
// 라우트로 분리되어 있고 이 스트림에는 결과만 흘러간다.

import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import {
  authenticateGameViewer,
  loadGameSnapshot,
  type GameSnapshot,
} from "@/lib/speed-game/runtime";

type Params = { params: Promise<{ gameId: string }> };

function hashSnapshot(snap: GameSnapshot): string {
  // roundIndex/status 변경 + 새 답 변경 + 리더보드 변경을 잡기 위한 단순 해시.
  // approval/rawText/correctCount/wrongCount 는 wire 에서 빠졌으므로 사용 안 함.
  const answerHash = snap.answers
    .map(
      (a) =>
        `${a.id}:${a.correct ? 1 : 0}:${a.score ?? 0}:${a.rank ?? 0}:${a.answer.length}`,
    )
    .join("|");
  const leaderHash = snap.leaderboard
    .map((e) => `${e.groupId}:${e.score}:${e.groupName}`)
    .join("|");
  return `${snap.status}|${snap.roundIndex}|${snap.rounds.length}|${answerHash}|${leaderHash}`;
}

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

  let cancelled = false;
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastHash = "";
      let lastAuthKind: string = auth.kind;

      function send(event: string, data: unknown) {
        if (cancelled) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          cancelled = true;
        }
      }

      async function tick() {
        if (cancelled) return;
        try {
          const snap = await loadGameSnapshot(gameId);
          if (!snap) {
            send("error", { message: "game_not_found" });
            controller.close();
            cancelled = true;
            return;
          }
          const hash = hashSnapshot(snap);
          if (hash !== lastHash) {
            const prev = lastHash;
            lastHash = hash;
            send("snapshot", { game: snap, prevHash: prev });
          }
          if (lastAuthKind !== auth.kind) {
            lastAuthKind = auth.kind;
            send("viewer", { kind: auth.kind });
          }
          if (snap.status === "finished") {
            send("finished", { game: snap });
            controller.close();
            cancelled = true;
            return;
          }
        } catch (e) {
          console.error("[speed-game stream]", e);
        }
        if (!cancelled) setTimeout(tick, 1000);
      }
      tick();
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}