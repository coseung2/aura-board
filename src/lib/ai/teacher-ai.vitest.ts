import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configFindUnique: vi.fn(),
  configFindMany: vi.fn(),
  keyFindMany: vi.fn(),
  boardFindUnique: vi.fn(),
  classroomFindUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    teacherAiFeatureConfig: {
      findUnique: mocks.configFindUnique,
      findMany: mocks.configFindMany,
    },
    teacherLlmKey: {
      findMany: mocks.keyFindMany,
    },
    board: {
      findUnique: mocks.boardFindUnique,
    },
    classroom: {
      findUnique: mocks.classroomFindUnique,
    },
  },
}));

vi.mock("@/lib/llm/encryption", () => ({
  decryptApiKey: vi.fn((value: string) => value.replace("encrypted:", "")),
}));

import {
  readTeacherAiSettings,
  resolveTeacherAiForUser,
} from "./teacher-ai";

function key(provider: string, modelId: string | null = null) {
  return {
    provider,
    apiKeyEnc: `encrypted:${provider}-key`,
    baseUrl: provider === "opencode-go" ? "https://opencode.ai/zen/go/v1" : null,
    modelId,
    verified: true,
    last4: "1234",
    verifiedAt: new Date("2026-08-06T10:00:00.000Z"),
    lastError: null,
    updatedAt: new Date("2026-08-06T10:00:00.000Z"),
  };
}

describe("feature-specific teacher AI resolver", () => {
  beforeEach(() => {
    mocks.configFindUnique.mockReset();
    mocks.configFindMany.mockReset();
    mocks.keyFindMany.mockReset();
    mocks.boardFindUnique.mockReset();
    mocks.classroomFindUnique.mockReset();
    mocks.configFindUnique.mockResolvedValue(null);
    mocks.configFindMany.mockResolvedValue([]);
    mocks.keyFindMany.mockResolvedValue([]);
  });

  it("uses the exact provider and model saved for a feature", async () => {
    mocks.configFindUnique.mockResolvedValue({
      provider: "openai",
      modelId: "gpt-5.6-terra",
    });
    mocks.keyFindMany.mockResolvedValue([key("openai"), key("gemini")]);

    const result = await resolveTeacherAiForUser("teacher-1", "quiz");

    expect(result).toMatchObject({
      teacherId: "teacher-1",
      feature: "quiz",
      provider: "openai",
      modelId: "gpt-5.6-terra",
      apiKey: "openai-key",
    });
  });

  it("does not silently switch providers when the selected provider key is missing", async () => {
    mocks.configFindUnique.mockResolvedValue({
      provider: "openai",
      modelId: "gpt-5.6-terra",
    });
    mocks.keyFindMany.mockResolvedValue([key("gemini")]);

    await expect(
      resolveTeacherAiForUser("teacher-1", "quiz"),
    ).resolves.toBeNull();
  });

  it("keeps a legacy single provider key working before feature configs are saved", async () => {
    mocks.keyFindMany.mockResolvedValue([
      key("opencode-go", "deepseek-v4-flash"),
    ]);

    const result = await resolveTeacherAiForUser("teacher-1", "feedback");

    expect(result).toMatchObject({
      provider: "opencode-go",
      modelId: "deepseek-v4-flash",
      apiKey: "opencode-go-key",
    });
  });

  it("returns defaults for all six features in the settings snapshot", async () => {
    mocks.keyFindMany.mockResolvedValue([]);
    mocks.configFindMany.mockResolvedValue([]);

    const snapshot = await readTeacherAiSettings("teacher-1");

    expect(snapshot.configs).toHaveLength(6);
    expect(snapshot.configs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "reading",
          provider: "gemini",
          modelId: "gemma-4-26b-a4b-it",
        }),
      ]),
    );
  });

  it("shows compatible models from a legacy single provider key", async () => {
    mocks.keyFindMany.mockResolvedValue([key("openai")]);
    mocks.configFindMany.mockResolvedValue([]);

    const snapshot = await readTeacherAiSettings("teacher-1");

    expect(snapshot.configs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "feedback",
          provider: "openai",
          modelId: "gpt-5.6-terra",
        }),
        expect.objectContaining({
          feature: "quiz",
          provider: "openai",
          modelId: "gpt-5.6-luna",
        }),
      ]),
    );
  });
});
