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

const PROBE_INTERVAL_MS = 3_000;
const PROBE_JITTER_MS = 1_000;
const KEEPALIVE_INTERVAL_MS = 25_000;

function toUpdatedAtMs(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

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
    select: { boardId: true, updatedAt: true },
  });
  if (!game) {
    return jsonPrivateNoStore({ error: "game_not_found" }, { status: 404 });
  }
  const auth = await authenticateGameViewer(game.boardId);
  if (auth.kind === "unauthorized") {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }

  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastHash = "";
      let lastUpdatedAt = toUpdatedAtMs(game.updatedAt);
      let lastKeepalive = Date.now();

      function finish() {
        if (cancelled) return;
        cancelled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        try {
          controller.close();
        } catch {
          // The client may have already cancelled the stream.
        }
      }

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

      function sendComment(comment: string) {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`: ${comment}\n\n`));
        } catch {
          cancelled = true;
        }
      }

      function sendSnapshot(snap: GameSnapshot) {
        const hash = hashSnapshot(snap);
        const prev = lastHash;
        lastHash = hash;
        send("snapshot", { game: snap, prevHash: prev });
      }

      async function readProbe() {
        return db.speedGame.findUnique({
          where: { id: gameId },
          select: { updatedAt: true, status: true },
        });
      }

      async function tick() {
        if (cancelled) return;
        try {
          const probe = await readProbe();
          if (!probe) {
            send("error", { message: "game_not_found" });
            finish();
            return;
          }

          const updatedAt = toUpdatedAtMs(probe.updatedAt);
          if (updatedAt !== lastUpdatedAt) {
            const snap = await loadGameSnapshot(gameId);
            if (!snap) {
              send("error", { message: "game_not_found" });
              finish();
              return;
            }
            // Consume the probe timestamp only after hydration succeeds. A
            // transient snapshot failure must retry on the next probe.
            lastUpdatedAt = updatedAt;
            sendSnapshot(snap);
            if (snap.status === "finished") {
              send("finished", { game: snap });
              finish();
              return;
            }
          }

          const now = Date.now();
          if (now - lastKeepalive >= KEEPALIVE_INTERVAL_MS) {
            sendComment("ping");
            lastKeepalive = now;
          }
        } catch (e) {
          console.error("[speed-game stream]", e);
        }

        if (!cancelled) {
          const jitter = Math.floor(Math.random() * (PROBE_JITTER_MS + 1));
          timer = setTimeout(tick, PROBE_INTERVAL_MS + jitter);
        }
      }

      let initial: GameSnapshot | null;
      try {
        initial = await loadGameSnapshot(gameId);
      } catch (error) {
        console.error("[speed-game stream initial]", error);
        // Force the first cheap probe to hydrate again. Do not terminate a
        // recoverable stream just because its initial snapshot read failed.
        lastUpdatedAt = null;
        timer = setTimeout(tick, PROBE_INTERVAL_MS);
        return;
      }
      if (!initial) {
        send("error", { message: "game_not_found" });
        finish();
        return;
      }
      sendSnapshot(initial);
      if (initial.status === "finished") {
        send("finished", { game: initial });
        finish();
        return;
      }

      // The first full snapshot is sent immediately; subsequent ticks only
      // perform the cheap updatedAt probe and hydrate when it changes.
      timer = setTimeout(tick, PROBE_INTERVAL_MS);
    },
    cancel() {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
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
