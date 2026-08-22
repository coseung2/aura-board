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

vi.mock("@/lib/reading-llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reading-llm")>();
  return {
    ...actual,
    evaluateReadingWithLlm: mocks.evaluate,
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

import { GET, POST } from "./route";
import { ReadingLlmError } from "@/lib/reading-llm";

const now = new Date("2026-08-06T09:00:00.000Z");
const STALE_PROCESSING_MS = 2 * 60 * 1_000;

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

function getRequest() {
  return new Request("http://localhost/api/student/reading/log-1/feedback", {
    method: "GET",
  });
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
      modelId: "gemini-2.5-flash",
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

  it.each([
    {
      provider: "openai" as const,
      modelId: "gpt-5.6-terra",
      baseUrl: "https://teacher-openai.example/v1",
    },
    {
      provider: "gemini" as const,
      modelId: "gemini-2.5-pro",
      baseUrl: "https://teacher-gemini.example/v1",
    },
    {
      provider: "opencode-go" as const,
      modelId: "deepseek-v4-pro",
      baseUrl: "https://teacher-opencode.example/v1",
    },
  ])("accepts the teacher-selected $provider reading model", async (selection) => {
    mocks.getTeacherKey.mockResolvedValue({
      teacherId: "teacher-1",
      ...selection,
      apiKey: "selected-provider-key",
      verified: true,
    });
    mocks.evaluate.mockResolvedValue({
      model: selection.modelId,
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

    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.evaluation).toMatchObject({
      aiScore: 8,
      aiFeedbackStatus: "generated",
      aiFeedbackModel: selection.modelId,
    });
    expect(mocks.getTeacherKey).toHaveBeenCalledWith("classroom-1", "reading");
    expect(mocks.evaluate).toHaveBeenCalledWith({
      provider: selection.provider,
      modelId: selection.modelId,
      apiKey: "selected-provider-key",
      baseUrl: selection.baseUrl,
      input: expect.objectContaining({ title: "어린 왕자" }),
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ aiScore: 8, aiFeedbackStatus: "generated" }),
      }),
    );
  });

  it("keeps the log and marks feedback failed when the teacher has no AI key", async () => {
    mocks.getTeacherKey.mockResolvedValue(null);

    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("reading_ai_key_missing");
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ aiFeedbackStatus: "failed" }),
      }),
    );
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("marks the log failed and returns a provider-neutral error when evaluation fails", async () => {
    mocks.evaluate.mockRejectedValue(
      new ReadingLlmError("quota_exceeded", "provider quota", 429),
    );

    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe("reading_ai_quota_exceeded");
    expect(mocks.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiFeedbackStatus: "failed",
          aiFeedbackError: expect.any(String),
        }),
      }),
    );
  });

  it("returns an existing generated evaluation without calling the LLM again", async () => {
    mocks.log = {
      ...pendingLog(),
      aiScore: 9,
      aiFeedback: "기존 피드백",
      aiFeedbackStatus: "generated",
      aiFeedbackModel: "gemini-2.5-pro",
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

describe("GET /api/student/reading/[logId]/feedback", () => {
  beforeEach(() => {
    mocks.log = pendingLog();
    mocks.findFirst.mockReset().mockImplementation(async () => mocks.log);
    mocks.findUnique.mockReset().mockImplementation(async () => mocks.log);
    mocks.updateMany.mockReset();
    mocks.update.mockReset();
    mocks.getTeacherKey.mockReset();
    mocks.limit.mockReset();
    mocks.evaluate.mockReset();
  });

  it("returns the current evaluation for the authenticated owner", async () => {
    mocks.log = {
      ...pendingLog(),
      aiScore: 9,
      aiFeedback: "완성된 피드백",
      aiFeedbackStatus: "generated",
      aiFeedbackModel: "gemini-2.5-pro",
      evaluatedAt: now,
    };

    const response = await GET(getRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      evaluation: {
        aiScore: 9,
        aiFeedback: "완성된 피드백",
        aiFeedbackStatus: "generated",
        aiFeedbackModel: "gemini-2.5-pro",
        aiFeedbackError: null,
        evaluatedAt: now.toISOString(),
      },
    });
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "log-1",
          studentId: "student-1",
          classroomId: "classroom-1",
        },
      }),
    );
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps a recently started generation in processing", async () => {
    mocks.log = {
      ...pendingLog(),
      aiFeedbackStatus: "processing",
      updatedAt: new Date(Date.now() - STALE_PROCESSING_MS + 30_000),
    };

    const response = await GET(getRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.evaluation.aiFeedbackStatus).toBe("processing");
    expect(body.evaluation.aiFeedbackError).toBeNull();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not confirm an overdue processing row as failed because the worker may still succeed", async () => {
    mocks.log = {
      ...pendingLog(),
      aiFeedbackStatus: "processing",
      updatedAt: new Date(Date.now() - STALE_PROCESSING_MS - 1_000),
    };

    const response = await GET(getRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.evaluation.aiFeedbackStatus).toBe("processing");
    expect(body.evaluation.aiFeedbackError).toBeNull();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("returns a failed result without changing it during status polling", async () => {
    mocks.log = {
      ...pendingLog(),
      aiFeedbackStatus: "failed",
      aiFeedbackError: "AI 피드백을 생성하지 못했어요.",
    };

    const response = await GET(getRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.evaluation).toMatchObject({
      aiFeedbackStatus: "failed",
      aiFeedbackError: "AI 피드백을 생성하지 못했어요.",
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns not found when the reading log belongs to another student or classroom", async () => {
    mocks.findFirst.mockResolvedValue(null);

    const response = await GET(getRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("reading_log_not_found");
  });
});
