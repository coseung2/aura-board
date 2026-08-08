import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/mobile/lib/persistent-json-cache", () => ({
  readPersistentJson: vi.fn(async () => null),
  removePersistentJson: vi.fn(async () => undefined),
  writePersistentJson: vi.fn(async () => undefined),
}));

import {
  boardDetailCacheKey,
  clearBoardCache,
  readBoardCache,
  removeBoardCache,
  writeBoardCache,
} from "../../../apps/mobile/lib/board-cache";

describe("student board cache removal", () => {
  beforeEach(() => {
    clearBoardCache();
  });

  it("removes a revoked detail snapshot instead of serving it again", () => {
    const key = boardDetailCacheKey("board-1");
    writeBoardCache(key, { board: { id: "board-1" } }, { kind: "detail" });

    removeBoardCache(key);

    expect(readBoardCache(key, { kind: "detail" })).toBeNull();
  });
});
