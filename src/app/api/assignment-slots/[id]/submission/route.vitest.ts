import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentStudent: vi.fn(),
  ensureAccountFor: vi.fn(),
  award: vi.fn(),
  loadPolicy: vi.fn(),
  touch: vi.fn(),
  publish: vi.fn(),
}));

const runtime = vi.hoisted(() => {
  const fresh = () => ({
    slot: {
      id: "slot-1", boardId: "board-1", cardId: "card-1", studentId: "student-1",
      slotNumber: 1, submissionStatus: "assigned", gradingStatus: "not_graded",
      grade: null, viewedAt: null, returnedAt: null, returnReason: null,
      dueAt: new Date("2026-07-20T12:00:00.000Z") as Date | null,
      submissionRevision: 0, updatedAt: new Date("2026-07-20T09:00:00.000Z"),
    },
    board: {
      id: "board-1", assignmentAllowLate: true,
      assignmentDeadline: new Date("2026-07-20T12:00:00.000Z") as Date | null,
    },
    card: {
      id: "card-1", content: "", imageUrl: null, thumbUrl: null, linkUrl: null,
      updatedAt: new Date("2026-07-20T09:00:00.000Z"),
    },
    submission: null as null | { id: string; fileUrl: string | null },
    attempts: [] as Array<{
      id: string; assignmentSlotId: string; idempotencyKey: string; revision: number;
      submittedAt: Date; submittedOnTime: boolean;
    }>,
  });
  let state = fresh();
  const row = () => ({
    ...state.slot,
    student: { name: "학생" },
    card: state.card,
    submission: state.submission,
    submissionAttempts: [...state.attempts].sort((a, b) => b.revision - a.revision).slice(0, 1),
  });
  const tx = {
    assignmentSlot: {
      findUnique: vi.fn(async () => ({ ...state.slot, board: state.board })),
      findUniqueOrThrow: vi.fn(async () => row()),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.slot, data, { updatedAt: new Date() });
        return row();
      }),
    },
    assignmentSubmissionAttempt: {
      findUnique: vi.fn(async ({ where }: {
        where: { assignmentSlotId_idempotencyKey: { idempotencyKey: string } };
      }) => state.attempts.find(
        (item) => item.idempotencyKey === where.assignmentSlotId_idempotencyKey.idempotencyKey,
      ) ?? null),
      create: vi.fn(async ({ data }: { data: Omit<(typeof state.attempts)[number], "id"> }) => {
        const attempt = { ...data, id: `attempt-${data.revision}` };
        state.attempts.push(attempt);
        return attempt;
      }),
    },
    card: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.card, data, { updatedAt: new Date() });
        return state.card;
      }),
    },
    submission: {
      upsert: vi.fn(async () => {
        state.submission = { id: "submission-1", fileUrl: null };
        return state.submission;
      }),
    },
    transaction: { findFirst: vi.fn(async () => null) },
  };
  const db = {
    assignmentSlot: { findUnique: vi.fn(async () => ({ ...state.slot, board: state.board })) },
    assignmentSubmissionAttempt: tx.assignmentSubmissionAttempt,
    $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => {
      const snapshot = structuredClone(state);
      try {
        return await operation(tx);
      } catch (error) {
        state = snapshot;
        throw error;
      }
    }),
  };
  return {
    db,
    reset: () => { state = fresh(); },
    get: () => state,
  };
});

vi.mock("@/lib/db", () => ({ db: runtime.db }));
vi.mock("@/lib/student-auth", () => ({ getCurrentStudent: mocks.getCurrentStudent }));
vi.mock("@/lib/bank", () => ({ ensureAccountFor: mocks.ensureAccountFor }));
vi.mock("@/lib/reward-service", () => ({
  awardCappedPolicyReward: mocks.award,
  loadRewardPolicy: mocks.loadPolicy,
}));
vi.mock("@/lib/creatures/activity-rewards", () => ({
  retryActivityRewardTransaction: (operation: () => Promise<unknown>) => operation(),
}));
vi.mock("@/lib/blob", () => ({ resizeToWebPThumbUrl: vi.fn() }));
vi.mock("@/lib/assignment-api", () => ({
  SLOT_INCLUDE_DEFAULT: {},
  slotRowToDTO: (row: { id: string; dueAt: Date | null; submissionRevision: number }) => ({
    id: row.id,
    dueAt: row.dueAt?.toISOString() ?? null,
    submissionRevision: row.submissionRevision,
  }),
}));
vi.mock("@/lib/board-touch", () => ({ touchBoardUpdatedAt: mocks.touch }));
vi.mock("@/lib/realtime", () => ({
  assignmentChannelKey: vi.fn(() => "channel"),
  publish: mocks.publish,
}));

import { POST } from "./route";

function submit(key: string) {
  const req = new Request("https://example.test/api/assignment-slots/slot-1/submission", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: key, content: "완료" }),
  });
  return POST(req, { params: Promise.resolve({ id: "slot-1" }) });
}

describe("assignment submission deadline rewards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
    vi.clearAllMocks();
    runtime.reset();
    mocks.getCurrentStudent.mockResolvedValue({ id: "student-1", classroomId: "classroom-1" });
    mocks.ensureAccountFor.mockResolvedValue({ accountId: "account-1" });
    mocks.loadPolicy.mockResolvedValue({ assignmentRewardAmount: 20 });
    mocks.award.mockResolvedValue({ amount: 20, idempotent: false });
  });

  afterEach(() => vi.useRealTimers());

  it("rewards equality at the deadline and not one millisecond late", async () => {
    const onTime = await submit("attempt-key-equal");
    expect((await onTime.json()).submission).toMatchObject({
      submittedOnTime: true, rewardAwarded: true, rewardAmount: 20,
    });
    expect(mocks.award).toHaveBeenCalledTimes(1);

    runtime.reset();
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-07-20T12:00:00.001Z"));
    const late = await submit("attempt-key-late");
    expect((await late.json()).submission).toMatchObject({
      submittedOnTime: false, rewardEligible: false, rewardAwarded: false,
    });
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("uses the post-preprocessing transaction time for reward eligibility", async () => {
    vi.setSystemTime(new Date("2026-07-20T11:59:59.999Z"));
    mocks.ensureAccountFor.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-07-20T12:00:00.001Z"));
      return { accountId: "account-1" };
    });

    const response = await submit("attempt-key-delayed");
    expect(response.status).toBe(200);
    expect((await response.json()).submission).toMatchObject({
      submittedAt: "2026-07-20T12:00:00.001Z",
      submittedOnTime: false,
      rewardAwarded: false,
    });
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("rejects a one-millisecond-late submission when late work is disabled", async () => {
    runtime.get().board.assignmentAllowLate = false;
    vi.setSystemTime(new Date("2026-07-20T12:00:00.001Z"));

    const response = await submit("attempt-key-late-locked");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "submission_locked" });
    expect(runtime.get().attempts).toHaveLength(0);
    expect(runtime.get().submission).toBeNull();
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("replays the same request once and rewards a returned resubmission with a new key", async () => {
    await submit("attempt-key-first");
    runtime.get().slot.gradingStatus = "released";
    const replay = await submit("attempt-key-first");
    expect((await replay.json()).submission.idempotent).toBe(true);
    expect(runtime.get().attempts).toHaveLength(1);
    expect(mocks.award).toHaveBeenCalledTimes(1);
    expect(mocks.touch).toHaveBeenCalledTimes(1);
    expect(mocks.publish).toHaveBeenCalledTimes(1);

    runtime.get().slot.submissionStatus = "returned";
    runtime.get().slot.gradingStatus = "not_graded";
    await submit("attempt-key-second");
    expect(runtime.get().attempts).toHaveLength(2);
    expect(runtime.get().slot.submissionRevision).toBe(2);
    expect(mocks.award).toHaveBeenCalledTimes(2);
  });

  it("stores a legacy no-deadline submission without paying it", async () => {
    runtime.get().slot.dueAt = null;
    runtime.get().board.assignmentDeadline = null;
    const response = await submit("attempt-key-legacy");
    expect(response.status).toBe(200);
    expect((await response.json()).submission.submittedOnTime).toBe(false);
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("rolls all submission writes back when reward processing fails", async () => {
    mocks.award.mockRejectedValueOnce(new Error("wallet failure"));
    await expect(submit("attempt-key-rollback")).rejects.toThrow("wallet failure");
    expect(runtime.get().slot.submissionRevision).toBe(0);
    expect(runtime.get().slot.submissionStatus).toBe("assigned");
    expect(runtime.get().submission).toBeNull();
    expect(runtime.get().attempts).toHaveLength(0);
    expect(mocks.touch).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
