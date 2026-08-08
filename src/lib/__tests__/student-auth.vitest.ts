import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  cookies: vi.fn(),
  studentFindUnique: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: mocks.headers,
  cookies: mocks.cookies,
}));
vi.mock("@/lib/db", () => ({
  db: {
    student: {
      findUnique: mocks.studentFindUnique,
    },
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));

import {
  clearStudentIdentityCacheForTests,
  getCurrentStudentIdentity,
  getCurrentStudentIdentityRaw,
  invalidateStudentIdentityCache,
} from "@/lib/student-auth";

const SECRET = "student-auth-test-secret";

function studentToken(sessionVersion = 3): string {
  const payload = Buffer.from(
    JSON.stringify({
      studentId: "student-1",
      classroomId: "classroom-1",
      sessionVersion,
      exp: Date.now() + 60_000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

describe("getCurrentStudentIdentityRaw", () => {
  beforeEach(() => {
    clearStudentIdentityCacheForTests();
    vi.stubEnv("AUTH_SECRET", SECRET);
    mocks.headers.mockReset();
    mocks.cookies.mockReset();
    mocks.studentFindUnique.mockReset();
    mocks.getCurrentUser.mockReset();
    mocks.getCurrentUser.mockRejectedValue(new Error("Unauthenticated"));
    mocks.headers.mockResolvedValue(
      new Headers({ authorization: `Bearer ${studentToken()}` }),
    );
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => undefined) });
    mocks.studentFindUnique.mockResolvedValue({
      id: "student-1",
      name: "학생",
      classroomId: "classroom-1",
      sessionVersion: 3,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads only the identifiers needed by hot classroom routes", async () => {
    await expect(getCurrentStudentIdentityRaw()).resolves.toEqual({
      id: "student-1",
      name: "학생",
      classroomId: "classroom-1",
    });
    expect(mocks.studentFindUnique).toHaveBeenCalledWith({
      where: { id: "student-1" },
      select: { id: true, name: true, classroomId: true, sessionVersion: true },
    });
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it("deduplicates repeated and simultaneous identity reads", async () => {
    const [first, second] = await Promise.all([
      getCurrentStudentIdentityRaw(),
      getCurrentStudentIdentityRaw(),
    ]);
    const third = await getCurrentStudentIdentityRaw();

    expect(first).toEqual({
      id: "student-1",
      name: "학생",
      classroomId: "classroom-1",
    });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(mocks.studentFindUnique).toHaveBeenCalledTimes(1);
  });

  it("reloads immediately after explicit session invalidation", async () => {
    await getCurrentStudentIdentityRaw();
    invalidateStudentIdentityCache("student-1");
    mocks.studentFindUnique.mockResolvedValue({
      id: "student-1",
      name: "바뀐 학생",
      classroomId: "classroom-1",
      sessionVersion: 3,
    });

    await expect(getCurrentStudentIdentityRaw()).resolves.toMatchObject({
      name: "바뀐 학생",
    });
    expect(mocks.studentFindUnique).toHaveBeenCalledTimes(2);
  });

  it("rejects a revoked student session version", async () => {
    mocks.studentFindUnique.mockResolvedValue({
      id: "student-1",
      name: "학생",
      classroomId: "classroom-1",
      sessionVersion: 4,
    });

    await expect(getCurrentStudentIdentityRaw()).resolves.toBeNull();
  });

  it("preserves teacher-session precedence without reading the student row", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1" });

    await expect(getCurrentStudentIdentity()).resolves.toBeNull();
    expect(mocks.studentFindUnique).not.toHaveBeenCalled();
  });

  it("falls through to the lightweight student lookup when no teacher is signed in", async () => {
    await expect(getCurrentStudentIdentity()).resolves.toEqual({
      id: "student-1",
      name: "학생",
      classroomId: "classroom-1",
    });
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.studentFindUnique).toHaveBeenCalledTimes(1);
  });
});
