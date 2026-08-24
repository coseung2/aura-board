import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  targets: [] as Array<{
    targetKind: "card" | "comment";
    targetId: string;
    viaReport: boolean;
    createdAt: Date;
  }>,
  authors: [] as Array<{
    hiddenStudentId: string;
    createdAt: Date;
    hiddenStudent: { name: string };
  }>,
  unhideTarget: vi.fn(),
  unhideAuthor: vi.fn(),
}));

vi.mock("@/lib/student-auth", () => ({
  getCurrentStudent: vi.fn(async () => ({
    id: "student-1",
    classroomId: "classroom-1",
  })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    hiddenContent: { findMany: vi.fn(async () => mocks.targets) },
    feedHiddenContent: { findMany: vi.fn(async () => []) },
    hiddenContentAuthor: { findMany: vi.fn(async () => mocks.authors) },
  },
}));

vi.mock("@/lib/content-safety-service", () => ({
  hideTarget: vi.fn(),
  resolveReportTarget: vi.fn(),
  unhideTarget: mocks.unhideTarget,
  unhideAuthor: mocks.unhideAuthor,
}));

import { DELETE, GET } from "./route";

describe("student hidden content", () => {
  beforeEach(() => {
    mocks.targets = [
      {
        targetKind: "card",
        targetId: "card-1",
        viaReport: true,
        createdAt: new Date("2026-07-25T00:00:00.000Z"),
      },
    ];
    mocks.authors = [
      {
        hiddenStudentId: "student-2",
        createdAt: new Date("2026-07-25T01:00:00.000Z"),
        hiddenStudent: { name: "친구" },
      },
    ];
    mocks.unhideTarget.mockReset();
    mocks.unhideAuthor.mockReset();
    mocks.unhideTarget.mockImplementation(
      async ({ targetId }: { targetId: string }) => {
        mocks.targets = mocks.targets.filter(
          (item) => item.targetId !== targetId,
        );
      },
    );
    mocks.unhideAuthor.mockImplementation(
      async ({ hiddenStudentId }: { hiddenStudentId: string }) => {
        mocks.authors = mocks.authors.filter(
          (item) => item.hiddenStudentId !== hiddenStudentId,
        );
      },
    );
  });

  it("returns persisted cards and authors, then confirms target restoration on reload", async () => {
    const before = await GET();
    expect(await before.json()).toEqual({
      items: [
        {
          targetKind: "card",
          targetId: "card-1",
          viaReport: true,
          createdAt: "2026-07-25T00:00:00.000Z",
        },
      ],
      authors: [
        {
          studentId: "student-2",
          name: "친구",
          createdAt: "2026-07-25T01:00:00.000Z",
        },
      ],
    });

    const restored = await DELETE(
      new Request("http://localhost/api/student/hidden-content", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "target",
          targetKind: "card",
          targetId: "card-1",
        }),
      }),
    );
    expect(restored.status).toBe(200);
    expect(mocks.unhideTarget).toHaveBeenCalledWith({
      studentId: "student-1",
      targetKind: "card",
      targetId: "card-1",
    });

    const after = await GET();
    expect((await after.json()).items).toEqual([]);
  });
});
