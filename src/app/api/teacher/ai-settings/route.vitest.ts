import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readSettings: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "teacher-1" })),
}));

vi.mock("@/lib/ai/teacher-ai", () => ({
  readTeacherAiSettings: mocks.readSettings,
}));

vi.mock("@/lib/db", () => ({
  db: {
    teacherAiFeatureConfig: {
      upsert: mocks.upsert,
    },
  },
}));

vi.mock("@/lib/rate-limit-routes", () => ({
  limitLlmKeyMutation: vi.fn(async () => ({ ok: true, retryAfter: 0 })),
}));

import { GET, PUT } from "./route";

const snapshot = {
  keys: [],
  configs: [
    {
      feature: "reading",
      provider: "gemini",
      modelId: "gemma-4-26b-a4b-it",
    },
  ],
};

function putRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/teacher/ai-settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("teacher feature AI settings route", () => {
  beforeEach(() => {
    mocks.readSettings.mockReset();
    mocks.upsert.mockReset();
    mocks.readSettings.mockResolvedValue(snapshot);
    mocks.upsert.mockResolvedValue({});
  });

  it("returns feature configs and the model catalog", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.configs).toEqual(snapshot.configs);
    expect(body.catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "gemini",
          id: "gemma-4-26b-a4b-it",
        }),
        expect.objectContaining({
          provider: "openai",
          id: "gpt-5.6-terra",
        }),
      ]),
    );
  });

  it("persists a catalog model for one feature", async () => {
    const response = await PUT(
      putRequest({
        feature: "quiz",
        provider: "openai",
        modelId: "gpt-5.6-terra",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: {
        userId_feature: { userId: "teacher-1", feature: "quiz" },
      },
      update: { provider: "openai", modelId: "gpt-5.6-terra" },
      create: {
        userId: "teacher-1",
        feature: "quiz",
        provider: "openai",
        modelId: "gpt-5.6-terra",
      },
    });
  });

  it("rejects a model that does not belong to the selected provider", async () => {
    const response = await PUT(
      putRequest({
        feature: "vibe",
        provider: "openai",
        modelId: "gemini-3.6-flash",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: "model_not_in_catalog" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
