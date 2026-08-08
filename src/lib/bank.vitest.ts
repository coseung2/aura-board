import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAccount: vi.fn(),
  transaction: vi.fn(),
  upsertAccount: vi.fn(),
  findCard: vi.fn(),
  createCard: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    studentAccount: { findUnique: mocks.findAccount },
    $transaction: mocks.transaction,
  },
}));

vi.mock("./qr-token", () => ({
  generateCardNumber: vi.fn(() => "123456789012"),
  generateCardSecret: vi.fn(() => "secret"),
}));

import { ensureAccountFor } from "./bank";

describe("ensureAccountFor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (
        operation: (tx: {
          studentAccount: { upsert: typeof mocks.upsertAccount };
          studentCard: {
            findUnique: typeof mocks.findCard;
            create: typeof mocks.createCard;
          };
        }) => Promise<unknown>,
      ) =>
        operation({
          studentAccount: { upsert: mocks.upsertAccount },
          studentCard: {
            findUnique: mocks.findCard,
            create: mocks.createCard,
          },
        }),
    );
  });

  it("returns an existing account/card without opening an upsert transaction", async () => {
    mocks.findAccount.mockResolvedValue({
      id: "account-1",
      cards: [{ id: "card-1" }],
    });

    await expect(
      ensureAccountFor({ id: "student-1", classroomId: "classroom-1" }),
    ).resolves.toEqual({ accountId: "account-1", cardId: "card-1" });

    expect(mocks.findAccount).toHaveBeenCalledWith({
      where: { studentId: "student-1" },
      select: {
        id: true,
        cards: { take: 1, select: { id: true } },
      },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("retains the transactional create path when no card exists", async () => {
    mocks.findAccount.mockResolvedValue(null);
    mocks.upsertAccount.mockResolvedValue({
      id: "account-new",
      cards: [],
    });
    mocks.findCard.mockResolvedValue(null);
    mocks.createCard.mockResolvedValue({ id: "card-new" });

    await expect(
      ensureAccountFor({ id: "student-1", classroomId: "classroom-1" }),
    ).resolves.toEqual({ accountId: "account-new", cardId: "card-new" });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.createCard).toHaveBeenCalledTimes(1);
  });
});
