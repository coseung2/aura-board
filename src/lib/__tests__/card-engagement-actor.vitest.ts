import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  card: {
    id: "card-1",
    studentAuthorId: "student-1",
    authors: [{ studentId: "student-1" }] as Array<{ studentId: string | null }>,
    board: {
      classroomId: "classroom-1",
      anonymousAuthor: false,
      classroom: { teacherId: "teacher-1" },
      members: [] as Array<{ userId: string }>,
    },
  },
  link: { id: "link-1" } as { id: string } | null,
  findLink: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: vi.fn(),
  getCurrentStudentRaw: vi.fn(),
}));
vi.mock("@/lib/parent-session", () => ({ getCurrentParent: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    card: { findUnique: vi.fn(async () => mocks.card) },
    parentChildLink: {
      findFirst: mocks.findLink,
    },
  },
}));

import { authorizeCardAccess } from "@/lib/card-engagement-actor";

describe("authorizeCardAccess guardian scope", () => {
  beforeEach(() => {
    mocks.link = { id: "link-1" };
    mocks.card.studentAuthorId = "student-1";
    mocks.card.authors = [{ studentId: "student-1" }];
    mocks.findLink.mockReset();
    mocks.findLink.mockImplementation(async () => mocks.link);
  });

  it("authorizes a parent only through an active link to the exact card author", async () => {
    const result = await authorizeCardAccess(
      "card-1",
      { kind: "parent", id: "parent-1", name: "보호자" },
      "write",
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ctx: expect.objectContaining({
          studentAuthorId: "student-1",
          guardianAvailable: true,
        }),
      }),
    );
    expect(mocks.findLink).toHaveBeenCalledWith({
      where: {
        parentId: "parent-1",
        studentId: { in: ["student-1"] },
        status: "active",
        deletedAt: null,
      },
      select: { id: true },
    });
  });

  it("rejects a parent without the exact active child link", async () => {
    mocks.link = null;

    await expect(
      authorizeCardAccess(
        "card-1",
        { kind: "parent", id: "parent-2", name: "다른 보호자" },
        "read",
      ),
    ).resolves.toEqual({ ok: false, reason: "forbidden" });
  });

  it("authorizes a parent linked to a co-author included in the parent feed", async () => {
    mocks.card.studentAuthorId = "student-primary";
    mocks.card.authors = [
      { studentId: "student-primary" },
      { studentId: "student-child" },
    ];

    const result = await authorizeCardAccess(
      "card-1",
      { kind: "parent", id: "parent-1", name: "보호자" },
      "write",
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ctx: expect.objectContaining({
          studentAuthorIds: ["student-primary", "student-child"],
          guardianAvailable: true,
        }),
      }),
    );
    expect(mocks.findLink).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          parentId: "parent-1",
          studentId: { in: ["student-primary", "student-child"] },
        }),
      }),
    );
  });

  it("keeps classroom public access for another student but hides the guardian thread", async () => {
    const result = await authorizeCardAccess(
      "card-1",
      { kind: "student", id: "student-2", name: "학생", classroomId: "classroom-1" },
      "read",
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ctx: expect.objectContaining({ guardianAvailable: false }),
      }),
    );
    expect(mocks.findLink).not.toHaveBeenCalled();
  });

  it("opens the guardian thread to the student card author", async () => {
    const result = await authorizeCardAccess(
      "card-1",
      { kind: "student", id: "student-1", name: "학생", classroomId: "classroom-1" },
      "write",
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ctx: expect.objectContaining({ guardianAvailable: true }),
      }),
    );
  });
});
