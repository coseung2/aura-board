import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStudentBoardCacheForTests,
  invalidateStudentBoardCache,
  loadStudentBoardBaseCached,
} from "./student-board-cache";

describe("student board base cache", () => {
  beforeEach(() => {
    clearStudentBoardCacheForTests();
    vi.useRealTimers();
  });

  it("deduplicates simultaneous classroom board reads", async () => {
    let resolve!: (value: { id: string; cards: string[] }) => void;
    const pending = new Promise<{ id: string; cards: string[] }>((done) => {
      resolve = done;
    });
    const loader = vi.fn(() => pending);

    const first = loadStudentBoardBaseCached("class-1", "board-slug", loader);
    const second = loadStudentBoardBaseCached("class-1", "board-slug", loader);
    resolve({ id: "board-1", cards: ["card-1"] });

    await expect(first).resolves.toEqual({ id: "board-1", cards: ["card-1"] });
    await expect(second).resolves.toEqual({ id: "board-1", cards: ["card-1"] });
    await expect(
      loadStudentBoardBaseCached("class-1", "board-slug", loader),
    ).resolves.toEqual({ id: "board-1", cards: ["card-1"] });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("keeps classroom lookups isolated", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ id: "board-1", title: "1반" })
      .mockResolvedValueOnce({ id: "board-2", title: "2반" });

    await expect(
      loadStudentBoardBaseCached("class-1", "same-slug", loader),
    ).resolves.toMatchObject({ id: "board-1" });
    await expect(
      loadStudentBoardBaseCached("class-2", "same-slug", loader),
    ).resolves.toMatchObject({ id: "board-2" });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("invalidates every lookup registered for a board id", async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ id: "board-1", version: 1 })
      .mockResolvedValueOnce({ id: "board-1", version: 2 });

    await expect(
      loadStudentBoardBaseCached("class-1", "board-slug", loader),
    ).resolves.toMatchObject({ version: 1 });
    invalidateStudentBoardCache("board-1");
    await expect(
      loadStudentBoardBaseCached("class-1", "board-slug", loader),
    ).resolves.toMatchObject({ version: 2 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not resurrect an invalidated in-flight graph", async () => {
    let resolve!: (value: { id: string; version: number }) => void;
    const firstLoader = vi.fn(
      () =>
        new Promise<{ id: string; version: number }>((done) => {
          resolve = done;
        }),
    );
    const first = loadStudentBoardBaseCached(
      "class-1",
      "board-slug",
      firstLoader,
    );
    invalidateStudentBoardCache();
    resolve({ id: "board-1", version: 1 });
    await expect(first).resolves.toMatchObject({ version: 1 });

    const secondLoader = vi.fn(async () => ({ id: "board-1", version: 2 }));
    await expect(
      loadStudentBoardBaseCached("class-1", "board-slug", secondLoader),
    ).resolves.toMatchObject({ version: 2 });
    expect(secondLoader).toHaveBeenCalledTimes(1);
  });
});
