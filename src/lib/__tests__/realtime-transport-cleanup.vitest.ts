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
    expect(board).toContain("/api/speed-game/games/${gameId}");
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
