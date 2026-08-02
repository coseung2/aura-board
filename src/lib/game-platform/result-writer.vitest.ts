import { Prisma, type GameResult } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GameResultInvariantError,
  writeGameResult,
  type WriteGameResultInput,
} from "./result-writer";

const rows: GameResult[] = [];
const boardFindUnique = vi.fn();
const studentFindUnique = vi.fn();
const resultFindUnique = vi.fn();
const resultCreate = vi.fn();

const tx = {
  board: { findUnique: boardFindUnique },
  student: { findUnique: studentFindUnique },
  gameResult: {
    findUnique: resultFindUnique,
    create: resultCreate,
  },
} as unknown as Prisma.TransactionClient;

function input(
  overrides: Partial<WriteGameResultInput<"omok">> = {},
): WriteGameResultInput<"omok"> {
  return {
    gameKind: "omok",
    boardId: "board-1",
    classroomId: "classroom-1",
    studentId: "student-1",
    sourceType: "play_session",
    sourceId: "session-1",
    outcome: "win",
    score: null,
    metrics: { side: "black", moveCount: 21, reason: "five" },
    startedAt: new Date("2026-08-02T00:00:00.000Z"),
    completedAt: new Date("2026-08-02T00:01:00.000Z"),
    rulesVersion: 1,
    stateSchemaVersion: 1,
    ...overrides,
  };
}

describe("writeGameResult", () => {
  beforeEach(() => {
    rows.length = 0;
    boardFindUnique.mockReset().mockResolvedValue({
      classroomId: "classroom-1",
      category: "PLAY",
      layout: "omok",
    });
    studentFindUnique.mockReset().mockResolvedValue({ classroomId: "classroom-1" });
    resultFindUnique.mockReset().mockImplementation(
      async ({ where }: { where: { idempotencyKey: string } }) =>
        rows.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null,
    );
    resultCreate.mockReset().mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `result-${rows.length + 1}`,
          createdAt: new Date("2026-08-02T00:01:00.000Z"),
          ...data,
        } as GameResult;
        rows.push(row);
        return row;
      },
    );
  });

  it("creates one append-only row and exact retries return it", async () => {
    const first = await writeGameResult(tx, input());
    const replay = await writeGameResult(tx, input());

    expect(first.id).toBe("result-1");
    expect(replay).toBe(first);
    expect(resultCreate).toHaveBeenCalledTimes(1);
    expect(first.durationMs).toBe(BigInt(60_000));
    expect(first.idempotencyKey).toBe("omok:session-1:student-1");
  });

  it("rejects an idempotency key reused for another source", async () => {
    await writeGameResult(tx, input({ idempotencyKey: "fixed-key" }));
    await expect(
      writeGameResult(
        tx,
        input({ idempotencyKey: "fixed-key", sourceId: "session-2" }),
      ),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
    expect(rows).toHaveLength(1);
  });

  it("rejects malformed metrics before any write", async () => {
    await expect(
      writeGameResult(
        tx,
        input({
          metrics: {
            side: "black",
            moveCount: 21,
            reason: "five",
            leaked: "secret",
          } as never,
        }),
      ),
    ).rejects.toThrow();
    expect(resultCreate).not.toHaveBeenCalled();
  });

  it("rejects board/student identity drift", async () => {
    studentFindUnique.mockResolvedValue({ classroomId: "classroom-other" });
    await expect(writeGameResult(tx, input())).rejects.toEqual(
      new GameResultInvariantError("invalid_student_identity"),
    );
    expect(resultCreate).not.toHaveBeenCalled();
  });
});
