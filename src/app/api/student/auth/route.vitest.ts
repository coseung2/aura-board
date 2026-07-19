import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  createStudentSession: vi.fn(),
  limitStudentLogin: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { student: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/student-auth", () => ({
  createStudentSession: mocks.createStudentSession,
}));
vi.mock("@/lib/rate-limit", () => ({
  extractIp: () => "203.0.113.10",
  hashIp: (value: string) => `hashed:${value}`,
}));
vi.mock("@/lib/rate-limit-routes", () => ({
  limitStudentLogin: mocks.limitStudentLogin,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { POST } from "./route";

function request(token: unknown) {
  return new Request("https://example.test/api/student/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

describe("POST /api/student/auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limitStudentLogin.mockResolvedValue({ ok: true, retryAfter: 0 });
  });

  it("uses hashed IP and credential keys and returns Retry-After on rejection", async () => {
    mocks.limitStudentLogin.mockResolvedValue({ ok: false, retryAfter: 37 });

    const response = await POST(request("secret-code"));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
    expect(mocks.limitStudentLogin).toHaveBeenCalledWith(
      "hashed:203.0.113.10",
      "hashed:SECRET-CODE",
    );
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rejects overlong credentials before rate-limit or database work", async () => {
    const response = await POST(request("x".repeat(257)));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(mocks.limitStudentLogin).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
