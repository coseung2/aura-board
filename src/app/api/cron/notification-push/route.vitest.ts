import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLikes: vi.fn(),
  findComments: vi.fn(),
  findRewards: vi.fn(),
  findPendingLinks: vi.fn(),
  findStudents: vi.fn(),
  findAssignmentSlots: vi.fn(),
  dispatchStudent: vi.fn(),
  dispatchParent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    cardLike: { findMany: mocks.findLikes },
    cardComment: { findMany: mocks.findComments },
    transaction: { findMany: mocks.findRewards },
    parentChildLink: { findMany: mocks.findPendingLinks },
    student: { findMany: mocks.findStudents },
    assignmentSlot: { findMany: mocks.findAssignmentSlots },
  },
}));
vi.mock("@/lib/student-push", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/student-push")>();
  return { ...original, dispatchStudentNotificationPush: mocks.dispatchStudent };
});
vi.mock("@/lib/parent-push", () => ({
  dispatchParentNotificationPush: mocks.dispatchParent,
}));

import { GET } from "./route";

describe("GET /api/cron/notification-push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T15:30:00.000Z"));
    process.env.CRON_SECRET = "cron-test";
    mocks.findLikes.mockResolvedValue([]);
    mocks.findComments.mockResolvedValue([]);
    mocks.findRewards.mockResolvedValue([]);
    mocks.findPendingLinks.mockResolvedValue([]);
    mocks.findStudents.mockResolvedValue([]);
    mocks.findAssignmentSlots.mockResolvedValue([]);
    mocks.dispatchStudent.mockResolvedValue({ attempted: 1, skipped: 0 });
    mocks.dispatchParent.mockResolvedValue({ attempted: 1, skipped: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CRON_SECRET;
  });

  it.each([
    {
      name: "missing secret",
      secret: undefined,
      headers: { authorization: "Bearer cron-test" },
      status: 401,
    },
    {
      name: "missing header",
      secret: "cron-test",
      headers: {},
      status: 401,
    },
    {
      name: "malformed scheme",
      secret: "cron-test",
      headers: { authorization: "Basic cron-test" },
      status: 401,
    },
    {
      name: "wrong secret",
      secret: "cron-test",
      headers: { authorization: "Bearer wrong" },
      status: 401,
    },
    {
      name: "x-vercel-cron only",
      secret: "cron-test",
      headers: { "x-vercel-cron": "1" },
      status: 401,
    },
    {
      name: "valid bearer secret",
      secret: "cron-test",
      headers: { authorization: "Bearer cron-test" },
      status: 200,
    },
  ])(
    "handles $name without crossing the auth boundary",
    async ({ secret, headers, status }) => {
      if (secret === undefined) {
        delete process.env.CRON_SECRET;
      } else {
        process.env.CRON_SECRET = secret;
      }

      const response = await GET(
        new Request("http://localhost/api/cron/notification-push", { headers }),
      );

      expect(response.status).toBe(status);
      if (status === 401) {
        expect(mocks.findLikes).not.toHaveBeenCalled();
        expect(mocks.findComments).not.toHaveBeenCalled();
        expect(mocks.findRewards).not.toHaveBeenCalled();
        expect(mocks.findPendingLinks).not.toHaveBeenCalled();
        expect(mocks.findStudents).not.toHaveBeenCalled();
        expect(mocks.findAssignmentSlots).not.toHaveBeenCalled();
      } else {
        expect(mocks.findLikes).toHaveBeenCalledOnce();
      }
    },
  );

  it(
    "selects only students missing the current KST attendance and sends one daily reminder",
    async () => {
      vi.setSystemTime(new Date("2026-07-25T23:30:00.000Z"));
      mocks.findStudents.mockResolvedValue([{ id: "student-1" }]);

      const response = await GET(authorizedRequest());

      expect(response.status).toBe(200);
      expect(mocks.findStudents).toHaveBeenCalledWith({
        where: {
          pushDevices: { some: { disabledAt: null } },
          attendances: {
            none: { day: new Date("2026-07-26T00:00:00.000Z") },
          },
          pushDispatches: {
            none: {
              eventKey: {
                startsWith: "attendance-missing:",
                endsWith: ":2026-07-26",
              },
            },
          },
        },
        orderBy: { id: "asc" },
        select: { id: true },
        take: 200,
      });
      expect(mocks.dispatchStudent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKey: "attendance-missing:student-1:2026-07-26",
          studentId: "student-1",
          kind: "attendance",
          href: "/student",
        }),
      );
    },
  );

  it("does not send an attendance reminder before 08:00 KST", async () => {
    vi.setSystemTime(new Date("2026-07-25T22:59:59.999Z"));

    await GET(authorizedRequest());

    expect(mocks.findStudents).not.toHaveBeenCalled();
    expect(mocks.dispatchStudent).not.toHaveBeenCalled();
  });

  it("dispatches newly distributed slots to their assigned board", async () => {
    mocks.findAssignmentSlots.mockResolvedValue([
      {
        id: "slot-1",
        studentId: "student-1",
        board: { slug: "class-homework", title: "우리 반 과제" },
      },
    ]);

    await GET(authorizedRequest());

    expect(mocks.findAssignmentSlots).toHaveBeenCalledWith({
      where: {
        createdAt: { gte: new Date("2026-07-25T15:20:00.000Z") },
        submissionStatus: "assigned",
      },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: {
        id: true,
        studentId: true,
        board: { select: { slug: true, title: true } },
      },
    });
    expect(mocks.dispatchStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "assignment-distributed:slot-1",
        kind: "assignment",
        href: "/board/class-homework",
      }),
    );
  });

  it("keeps like, comment, reward, and parent dispatches intact", async () => {
    const board = {
      slug: "class-board",
      title: "학급 보드",
      anonymousAuthor: false,
    };
    mocks.findLikes.mockResolvedValue([
      {
        id: "like-1",
        likerKind: "teacher",
        likerStudentId: null,
        likerUser: { name: "김" },
        likerStudent: null,
        card: {
          title: "내 글",
          studentAuthorId: "student-1",
          authors: [],
          board,
        },
      },
    ]);
    mocks.findComments.mockResolvedValue([
      {
        id: "comment-1",
        authorKind: "teacher",
        authorStudentId: null,
        externalAuthorName: null,
        content: "잘했어요",
        authorUser: { name: "김" },
        authorStudent: null,
        card: {
          title: "내 글",
          studentAuthorId: "student-1",
          authors: [],
          board,
        },
      },
    ]);
    mocks.findRewards.mockResolvedValue([
      {
        id: "reward-1",
        sourceType: "assignment_reward",
        note: null,
        amount: 100,
        account: { studentId: "student-1" },
      },
    ]);
    mocks.findPendingLinks.mockResolvedValue([
      {
        id: "link-1",
        parentId: "parent-1",
        student: { name: "학생", classroom: { name: "1반" } },
      },
    ]);

    await GET(authorizedRequest());

    expect(mocks.dispatchStudent.mock.calls.map(([push]) => push.kind)).toEqual([
      "like",
      "comment",
      "reward",
    ]);
    expect(mocks.dispatchParent).toHaveBeenCalledOnce();
  });
});

function authorizedRequest() {
  return new Request("http://localhost/api/cron/notification-push", {
    headers: { authorization: "Bearer cron-test" },
  });
}
