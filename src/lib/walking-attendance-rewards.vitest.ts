import { describe, expect, it, vi } from "vitest";

import { awardWalkingAttendanceCookie } from "./walking-attendance-rewards";

function fakeTx(existingGrant = false) {
  return {
    transaction: {
      findFirst: vi.fn().mockResolvedValue(existingGrant ? { id: "grant-1" } : null),
      create: vi.fn().mockResolvedValue({ id: "grant-1" }),
    },
    studentAccount: {
      findUnique: vi.fn().mockResolvedValue({
        balance: 120,
        studentId: "student-1",
        classroomId: "classroom-1",
      }),
    },
    studentCreatureItem: {
      upsert: vi.fn().mockResolvedValue({ id: "inventory-1", quantity: 1 }),
    },
  };
}

function rewardInput(tx: ReturnType<typeof fakeTx>, ordinal: number) {
  return {
    tx: tx as never,
    studentId: "student-1",
    classroomId: "classroom-1",
    accountId: "account-1",
    month: "2026-07",
    ordinal,
    attendedDay: `2026-07-${String(ordinal).padStart(2, "0")}`,
  };
}

describe("walking attendance cookie reward", () => {
  it.each([7, 14, 21])("grants one cookie on attendance ordinal %i", async (ordinal) => {
    const tx = fakeTx();

    await expect(awardWalkingAttendanceCookie(rewardInput(tx, ordinal))).resolves.toBe(true);
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "item_grant",
        amount: 0,
        sourceRef: `student-1:2026-07:attendance:${ordinal}:cookie`,
      }),
    });
    expect(tx.studentCreatureItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ itemKey: "slime-cookie", quantity: 1 }),
        update: expect.objectContaining({ quantity: { increment: 1 } }),
      }),
    );
  });

  it("does not grant on a normal attendance day", async () => {
    const tx = fakeTx();
    await expect(awardWalkingAttendanceCookie(rewardInput(tx, 8))).resolves.toBe(false);
    expect(tx.transaction.findFirst).not.toHaveBeenCalled();
    expect(tx.studentCreatureItem.upsert).not.toHaveBeenCalled();
  });

  it("does not increment inventory when the milestone was already granted", async () => {
    const tx = fakeTx(true);
    await expect(awardWalkingAttendanceCookie(rewardInput(tx, 7))).resolves.toBe(false);
    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.studentCreatureItem.upsert).not.toHaveBeenCalled();
  });
});
