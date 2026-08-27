import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  studentFindUnique: vi.fn(),
  createStudentSession: vi.fn(),
  getAllCookies: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { student: { findUnique: mocks.studentFindUnique } },
}));
vi.mock("@/lib/student-auth", () => ({
  createStudentSession: mocks.createStudentSession,
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: mocks.getAllCookies })),
}));

import { GET } from "./route";

const context = { params: Promise.resolve({ token: "student-token" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AURA_BOARD_BASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "");
  mocks.studentFindUnique.mockResolvedValue({ id: "student-1", classroomId: "class-1" });
  mocks.createStudentSession.mockResolvedValue(undefined);
  mocks.getAllCookies.mockReturnValue([]);
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /qr/[token]", () => {
  it("redirects a standalone request to the forwarded public origin", async () => {
    const request = new Request("http://localhost:3000/qr/student-token?next=/student/boards", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "aura-board.com",
        host: "localhost:3000",
      },
    });

    const response = await GET(request, context);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://aura-board.com/student/boards");
    expect(mocks.createStudentSession).toHaveBeenCalledWith("student-1", "class-1");
  });

  it("uses the configured production origin before proxy headers", async () => {
    vi.stubEnv("AURA_BOARD_BASE_URL", "https://aura-board.com");
    const request = new Request("http://localhost:3000/qr/student-token", {
      headers: {
        "x-forwarded-proto": "http",
        "x-forwarded-host": "localhost:3000",
      },
    });

    const response = await GET(request, context);

    expect(response.headers.get("location")).toBe("https://aura-board.com/student");
  });

  it("redirects an invalid token on the public origin", async () => {
    mocks.studentFindUnique.mockResolvedValue(null);
    const request = new Request("http://localhost:3000/qr/invalid-token", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "aura-board.com",
      },
    });

    const response = await GET(request, context);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://aura-board.com/qr/invalid");
    expect(mocks.createStudentSession).not.toHaveBeenCalled();
  });

  it("keeps direct local development redirects on localhost", async () => {
    const request = new Request("http://localhost:3000/qr/student-token", {
      headers: { host: "localhost:3000" },
    });

    const response = await GET(request, context);

    expect(response.headers.get("location")).toBe("http://localhost:3000/student");
  });

  it("rejects external and auth-surface next targets", async () => {
    for (const next of [
      "https://example.com",
      "//example.com",
      "/login?role=teacher",
      "/api/student/me",
    ]) {
      const request = new Request(
        `http://localhost:3000/qr/student-token?next=${encodeURIComponent(next)}`,
        { headers: { host: "localhost:3000" } },
      );

      const response = await GET(request, context);
      expect(response.headers.get("location")).toBe("http://localhost:3000/student");
    }
  });
});
