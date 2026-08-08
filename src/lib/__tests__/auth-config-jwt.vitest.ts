import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  config: null as null | {
    callbacks: {
      jwt: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
  },
  userFindUnique: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: (config: typeof captured.config) => {
    captured.config = config;
    return {
      handlers: {},
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  },
}));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn((config) => config) }));
vi.mock("next-auth/providers/kakao", () => ({ default: vi.fn((config) => config) }));
vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((config) => config),
}));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: vi.fn(() => ({})) }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: captured.userFindUnique },
  },
}));
vi.mock("@/lib/account-principal", () => ({
  isSameAccountPrincipal: vi.fn(() => true),
}));
vi.mock("@/lib/parent-session", () => ({
  clearParentSession: vi.fn(),
  getCurrentParent: vi.fn(async () => null),
}));
vi.mock("@/lib/canva-reviewer-credentials", () => ({
  getCanvaReviewerCredentialConfig: vi.fn(() => null),
  verifyConfiguredCanvaReviewer: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  extractIp: vi.fn(() => "127.0.0.1"),
  hashIp: vi.fn((value: string) => value),
}));
vi.mock("@/lib/rate-limit-routes", () => ({
  limitCanvaReviewerLogin: vi.fn(async () => ({ ok: true })),
  limitPasswordLogin: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/password-credentials", () => ({
  normalizePasswordUsername: vi.fn((value: string) => value),
  verifyPasswordCredential: vi.fn(async () => null),
}));

import "@/lib/auth-config";

function jwtCallback() {
  const callback = captured.config?.callbacks.jwt;
  if (!callback) throw new Error("Auth.js JWT callback was not captured");
  return callback;
}

describe("teacher JWT lookup policy", () => {
  beforeEach(() => {
    captured.userFindUnique.mockReset();
  });

  it("does not query User again when the JWT already has a display name", async () => {
    const token = { id: "teacher-1", name: "교사" };

    await expect(
      jwtCallback()({ token, user: undefined, trigger: undefined, session: undefined }),
    ).resolves.toBe(token);
    expect(captured.userFindUnique).not.toHaveBeenCalled();
  });

  it("repairs a legacy token with no name once from the database", async () => {
    captured.userFindUnique.mockResolvedValue({ name: "  담임 교사  " });
    const token: Record<string, unknown> = { id: "teacher-1" };

    await expect(
      jwtCallback()({ token, user: undefined, trigger: undefined, session: undefined }),
    ).resolves.toEqual({ id: "teacher-1", name: "담임 교사" });
    expect(captured.userFindUnique).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
      select: { name: true },
    });
  });

  it("uses an explicit session update without querying User", async () => {
    const token: Record<string, unknown> = { id: "teacher-1", name: "이전 이름" };

    await expect(
      jwtCallback()({
        token,
        user: undefined,
        trigger: "update",
        session: { name: "  새 이름  " },
      }),
    ).resolves.toEqual({ id: "teacher-1", name: "새 이름" });
    expect(captured.userFindUnique).not.toHaveBeenCalled();
  });
});
