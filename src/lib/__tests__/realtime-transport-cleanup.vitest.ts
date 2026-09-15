import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("realtime transport cleanup", () => {
  it("leaves the web speed-game caller free of EventSource and stream URLs", () => {
    const board = source("src/components/speed-game/SpeedGameBoard.tsx");

    expect(board).not.toContain("EventSource");
    expect(board).not.toContain("/stream");
    expect(board).toContain("SPEED_GAME_CHANGED_EVENT");
    expect(board).toContain(
      "/api/speed-game/games/${encodeURIComponent(game.id)}",
    );
  });

  it("keeps mobile speed-game on realtime invalidation instead of a 2.5s poll", () => {
    const board = source("apps/mobile/components/layouts/SpeedGameBoard.tsx");

    expect(board).toContain("useLiveSnapshot");
    expect(board).toContain('events: ["speed_game_changed"]');
    expect(board).not.toContain("2_500");
  });

  it("keeps mobile shadow-alliance on realtime invalidation instead of a 10s poll", () => {
    const board = source("apps/mobile/components/layouts/ShadowAllianceBoard.tsx");

    expect(board).toContain("useLiveSnapshot");
    expect(board).toContain('events: ["play_session_changed"]');
    expect(board).not.toContain('setInterval(() => void load("refresh"), 10_000)');
  });

  it("keeps web song-guess broadcast-first without the student-free 2s poll", () => {
    const board = source("src/components/SongGuessBoard.tsx");

    expect(board).toContain("useRealtimeInvalidation");
    expect(board).toContain("PLAY_SESSION_CHANGED_EVENT");
    expect(board).toContain("nextTransitionAtMs");
    expect(board).not.toContain("setInterval(() => void refreshSession(), 2000)");
  });

  it("keeps mobile song-guess broadcast-first with fallback owned by the realtime controller", () => {
    const board = source("apps/mobile/components/layouts/SongGuessBoard.tsx");

    expect(board).toContain("useBoardRealtime");
    expect(board).toContain("fallbackPollMs: BOARD_REALTIME_FALLBACK_POLL_INTERVAL_MS");
    expect(board).toContain("nextTransitionAtMs");
    expect(board).not.toContain("setInterval(() => void refresh(), 2000)");
    expect(board).not.toContain("shouldUseBoardFallbackPolling");
  });

  it("subscribes the mobile assignment board to the existing assignment channel", () => {
    const board = source("apps/mobile/components/layouts/AssignmentBoard.tsx");

    expect(board).toContain("useLiveSnapshot");
    expect(board).toContain('`board:${data.board.id}:assignment`');
    expect(board).toContain('"slot.updated"');
    expect(board).toContain('"slot.returned"');
  });

  it.each([
    "src/app/api/boards/[id]/stream/route.ts",
    "src/app/api/speed-game/games/[gameId]/stream/route.ts",
  ])("keeps %s free of DB polling and SSE", (path) => {
    const route = source(path);

    expect(route).not.toContain("@/lib/db");
    expect(route).not.toContain("ReadableStream");
    expect(route).not.toContain("text/event-stream");
    expect(route).not.toContain("setTimeout");
    expect(route).not.toContain("setInterval");
  });
});
