import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  verifyApiKey: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "teacher-1" })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    teacherLlmKey: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
      deleteMany: mocks.deleteMany,
    },
  },
}));

vi.mock("@/lib/llm/encryption", () => ({
  encryptApiKey: vi.fn((value: string) => `encrypted:${value}`),
  last4: vi.fn((value: string) => value.slice(-4)),
}));

vi.mock("@/lib/llm/stream", () => ({
  verifyApiKey: mocks.verifyApiKey,
}));

vi.mock("@/lib/rate-limit-routes", () => ({
  limitLlmKeyMutation: vi.fn(async () => ({ ok: true, retryAfter: 0 })),
}));

import { DELETE, GET, POST } from "./route";

const now = new Date("2026-08-06T10:00:00.000Z");

function savedRow(provider: "openai" | "gemini" | "opencode-go", last4 = "1234") {
  return {
    userId: "teacher-1",
    provider,
    apiKeyEnc: `encrypted:${provider}`,
    last4,
    baseUrl: provider === "opencode-go" ? "https://opencode.ai/zen/go/v1" : null,
    modelId: null,
    verified: true,
    verifiedAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

function postRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/teacher/llm-key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("teacher provider key route", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
    mocks.findUnique.mockReset();
    mocks.upsert.mockReset();
    mocks.deleteMany.mockReset();
    mocks.verifyApiKey.mockReset();
    mocks.verifyApiKey.mockResolvedValue({ ok: true });
    mocks.findMany.mockResolvedValue([]);
  });

  it("returns every connected provider without exposing encrypted keys", async () => {
    mocks.findMany.mockResolvedValue([
      savedRow("gemini", "1111"),
      savedRow("openai", "2222"),
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.keys).toHaveLength(2);
    expect(body.keys[0]).toMatchObject({ provider: "gemini", last4: "1111" });
    expect(JSON.stringify(body)).not.toContain("apiKeyEnc");
  });

  it("stores and verifies an OpenAI key under the provider composite key", async () => {
    const openai = savedRow("openai", "7890");
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue(openai);
    mocks.findMany.mockResolvedValue([openai]);

    const response = await POST(
      postRequest({ provider: "openai", apiKey: "sk-test-123456789012345678901234567890" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyApiKey).toHaveBeenCalledWith(
      "openai",
      "sk-test-123456789012345678901234567890",
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_provider: { userId: "teacher-1", provider: "openai" },
        },
        create: expect.objectContaining({
          userId: "teacher-1",
          provider: "openai",
          verified: true,
        }),
      }),
    );
  });

  it("keeps an existing provider key when no replacement is supplied", async () => {
    const existing = savedRow("gemini", "4321");
    mocks.findUnique.mockResolvedValue(existing);
    mocks.upsert.mockResolvedValue(existing);
    mocks.findMany.mockResolvedValue([existing]);

    const response = await POST(postRequest({ provider: "gemini" }));

    expect(response.status).toBe(200);
    expect(mocks.verifyApiKey).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          apiKeyEnc: existing.apiKeyEnc,
          last4: "4321",
        }),
      }),
    );
  });

  it("deletes only the selected provider credential", async () => {
    const remaining = savedRow("gemini");
    mocks.findMany.mockResolvedValue([remaining]);

    const response = await DELETE(
      new Request("http://localhost/api/teacher/llm-key?provider=openai", {
        method: "DELETE",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { userId: "teacher-1", provider: "openai" },
    });
    expect(body.keys).toEqual([
      expect.objectContaining({ provider: "gemini" }),
    ]);
  });
});
