import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  txUpdateMany: vi.fn(),
  transaction: vi.fn(),
  getTeacherKeyForClassroom: vi.fn(),
  evaluateReadingWithLlm: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    readingLog: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/llm/teacher-key", () => ({
  getTeacherKeyForClassroom: mocks.getTeacherKeyForClassroom,
}));
vi.mock("@/lib/reading-llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/reading-llm")>();
  return {
    ...original,
    evaluateReadingWithLlm: mocks.evaluateReadingWithLlm,
  };
});

import { processNextReadingFeedback } from "./reading-feedback-worker";

const oldLog = {
  id: "log-1",
  classroomId: "classroom-1",
  currentRevision: 2,
  bookType: "story",
  title: "과학사를 알면 과학이 재밌어",
  author: "김성희, 권수진",
  reflection: "과학은 호기심에서 시작된다는 점이 인상 깊었다.",
};

describe("processNextReadingFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(oldLog);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.txUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ readingLog: { updateMany: mocks.txUpdateMany } }),
    );
    mocks.getTeacherKeyForClassroom.mockResolvedValue({
      teacherId: "teacher-1",
      provider: "google",
      apiKey: "test-key",
      modelId: "gemma-test",
      baseUrl: null,
    });
    mocks.evaluateReadingWithLlm.mockResolvedValue({
      evaluation: { score: 8, feedback: "구체적인 생각이 잘 드러났어요." },
      model: "gemma-test",
    });
  });

  it("returns idle when no old pending or stale processing record exists", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);

    await expect(
      processNextReadingFeedback(new Date("2026-08-25T00:10:00.000Z")),
    ).resolves.toEqual({ outcome: "idle" });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("claims one old record and stores its generated evaluation", async () => {
    const result = await processNextReadingFeedback(
      new Date("2026-08-25T00:10:00.000Z"),
    );

    expect(result).toEqual({ outcome: "generated", logId: "log-1", score: 8 });
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
    );
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "log-1", currentRevision: 2 }),
        data: { aiFeedbackStatus: "processing", aiFeedbackError: null },
      }),
    );
    expect(mocks.txUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: "log-1",
          currentRevision: 2,
          aiFeedbackStatus: "processing",
        },
        data: expect.objectContaining({
          aiScore: 8,
          aiFeedbackStatus: "generated",
          aiFeedbackModel: "gemma-test",
        }),
      }),
    );
    expect(mocks.txUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: "log-1", missionCounted: false },
      }),
    );
  });

  it("does not overwrite a record edited while evaluation was running", async () => {
    mocks.txUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(processNextReadingFeedback()).resolves.toEqual({
      outcome: "superseded",
      logId: "log-1",
    });
    expect(mocks.txUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("marks a claimed record failed when its teacher has no AI key", async () => {
    mocks.getTeacherKeyForClassroom.mockResolvedValueOnce(null);

    await expect(processNextReadingFeedback()).resolves.toEqual({
      outcome: "failed",
      logId: "log-1",
      error: "reading_ai_key_missing",
    });
    expect(mocks.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: "log-1",
          currentRevision: 2,
          aiFeedbackStatus: "processing",
        },
        data: expect.objectContaining({ aiFeedbackStatus: "failed" }),
      }),
    );
  });
});
