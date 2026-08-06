import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  log: null as null | Record<string, unknown>,
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  getTeacherKey: vi.fn(),
  evaluate: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: vi.fn(async () => ({
    id: "student-1",
    classroomId: "classroom-1",
    name: "학생",
  })),
}));

vi.mock("@/lib/llm/teacher-key", () => ({
  getTeacherKeyForClassroom: mocks.getTeacherKey,
}));

vi.mock("@/lib/reading-gemma", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reading-gemma")>();
  return {
    ...actual,
    evaluateReadingWithGemma: mocks.evaluate,
  };
});

vi.mock("@/lib/rate-limit-routes", () => ({
  limitReadingFeedback: mocks.limit,
}));

vi.mock("@/lib/db", () => ({
  db: {
    readingLog: {
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
  },
}));

import { POST } from "./route";

const now = new Date("2026-08-06T09:00:00.000Z");

function pendingLog() {
  return {
    id: "log-1",
    classroomId: "classroom-1",
    studentId: "student-1",
    bookType: "story",
    title: "어린 왕자",
    author: "생텍쥐페리",
    reflection: "친구를 소중하게 생각해야 한다고 느꼈어요.",
    aiScore: null,
    aiFeedback: null,
    aiFeedbackStatus: "pending",
    aiFeedbackModel: null,
    aiFeedbackError: null,
    evaluatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function request() {
  return new Request("http://localhost/api/student/reading/log-1/feedback", {
    method: "POST",
  });
}

function context() {
  return { params: Promise.resolve({ logId: "log-1" }) };
}

describe("POST /api/student/reading/[logId]/feedback", () => {
  beforeEach(() => {
    mocks.log = pendingLog();
    mocks.findFirst.mockReset().mockImplementation(async () => mocks.log);
    mocks.findUnique.mockReset().mockImplementation(async () => mocks.log);
    mocks.updateMany.mockReset().mockImplementation(async ({ data }) => {
      if (mocks.log) mocks.log = { ...mocks.log, ...data, updatedAt: new Date() };
      return { count: 1 };
    });
    mocks.update.mockReset().mockImplementation(async ({ data }) => {
      if (!mocks.log) throw new Error("missing log");
      mocks.log = { ...mocks.log, ...data, updatedAt: new Date() };
      return mocks.log;
    });
    mocks.getTeacherKey.mockReset().mockResolvedValue({
      teacherId: "teacher-1",
      provider: "gemini",
      apiKey: "test-key",
      baseUrl: null,
      modelId: null,
    });
    mocks.limit.mockReset().mockResolvedValue({ ok: true, retryAfter: 0 });
    mocks.evaluate.mockReset().mockResolvedValue({
      model: "gemma-4-26b-a4b-it",
      evaluation: {
        score: 8,
        feedback: "잘한 점: 생각이 잘 드러나요.",
        breakdown: {
          comprehension: 2,
          evidence: 2,
          personalResponse: 3,
          expression: 1,
        },
      },
    });
  });

  it("stores a Gemma score and feedback for the student's own log", async () => {
    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.evaluation).toMatchObject({
      aiScore: 8,
      aiFeedbackStatus: "generated",
      aiFeedbackModel: "gemma-4-26b-a4b-it",
    });
    expect(mocks.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-key",
        input: expect.objectContaining({ title: "어린 왕자" }),
      }),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ aiScore: 8, aiFeedbackStatus: "generated" }),
      }),
    );
  });

  it("keeps the log and marks feedback failed when the teacher has no Gemini key", async () => {
    mocks.getTeacherKey.mockResolvedValue(null);

    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("reading_gemini_key_missing");
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ aiFeedbackStatus: "failed" }),
      }),
    );
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("returns an existing generated evaluation without calling Gemma again", async () => {
    mocks.log = {
      ...pendingLog(),
      aiScore: 9,
      aiFeedback: "기존 피드백",
      aiFeedbackStatus: "generated",
      aiFeedbackModel: "gemma-4-26b-a4b-it",
      evaluatedAt: now,
    };

    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.alreadyGenerated).toBe(true);
    expect(body.evaluation.aiScore).toBe(9);
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
});
