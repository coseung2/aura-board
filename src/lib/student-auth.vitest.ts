import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(async () => ({ sessionVersion: 1 })),
  cookies: vi.fn(async () => ({ set: vi.fn(), get: vi.fn() })),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("./db", () => ({
  db: {
    student: {
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      findUnique: vi.fn(),
    },
  },
}));
vi.mock("./auth", () => ({ getCurrentUser: vi.fn(async () => null) }));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("student auth secret", () => {
  it("does not issue sessions with a development secret in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    const { createStudentSession } = await import("./student-auth");

    await expect(
      createStudentSession("student-1", "classroom-1"),
    ).rejects.toThrow("AUTH_SECRET is required in production");
  });

  it("keeps the development fallback outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "");
    const { createStudentSession } = await import("./student-auth");

    await expect(
      createStudentSession("student-1", "classroom-1"),
    ).resolves.toMatch(/^[^.]+\.[^.]+$/);
  });
});
