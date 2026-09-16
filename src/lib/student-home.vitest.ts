import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountFindUnique: vi.fn(),
  assignmentSlotFindMany: vi.fn(async () => []),
  boardFindMany: vi.fn(async () => []),
  checkTaskFindMany: vi.fn(async () => []),
  policyFindUnique: vi.fn(),
  sectionFindMany: vi.fn(async () => []),
  transactionCount: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    assignmentSlot: { findMany: mocks.assignmentSlotFindMany },
    avatarRewardConfig: { findUnique: mocks.policyFindUnique },
    board: { findMany: mocks.boardFindMany },
    classroomCheckTask: { findMany: mocks.checkTaskFindMany },
    section: { findMany: mocks.sectionFindMany },
    studentAccount: { findUnique: mocks.accountFindUnique },
    transaction: { count: mocks.transactionCount },
  },
}));

vi.mock("./role-portals", () => ({
  getStudentDuties: vi.fn(async () => []),
}));

import { getStudentHomePayload } from "./student-home";

const student = {
  id: "student-1",
  name: "학생",
  classroomId: "classroom-1",
  classroom: { id: "classroom-1", name: "1반", teacher: { email: "normal@example.com" } },
};

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("getStudentHomePayload daily rewards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AURA_ADMIN_EMAILS", "pilot@example.com");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T03:00:00.000Z"));
    mocks.policyFindUnique.mockResolvedValue({
      readingRewardPerPoint: 5,
      readingDailyRewardCap: 99,
      readingWeeklyRewardCap: 20,
      commentRewardAmount: 5,
      commentDailyRewardCap: 99,
      commentWeeklyRewardCap: 30,
    });
    mocks.accountFindUnique.mockResolvedValue({
      id: "account-1",
      studentId: student.id,
      classroomId: student.classroomId,
    });
    mocks.transactionCount.mockResolvedValue(10);
  });

  it("returns KST daily deposit counts with effective policy caps", async () => {
    const payload = await getStudentHomePayload(student);

    expect(payload.productCapabilities?.play).toBe(false);
    expect(payload.productCapabilities?.feed).toBe(false);
    expect(payload.availableLayouts).toContain("columns");
    expect(payload.availableLayouts).not.toContain("assignment");
    expect(mocks.assignmentSlotFindMany).not.toHaveBeenCalled();
    expect(mocks.boardFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ layout: { in: payload.availableLayouts } }),
    }));
    expect(payload.dailyRewards).toEqual({
      comment: { earnedCount: 10, dailyCap: 10, complete: true, enabled: true },
    });
    expect(mocks.transactionCount).toHaveBeenCalledOnce();
    expect(mocks.transactionCount).toHaveBeenCalledWith({
      where: {
        accountId: "account-1",
        sourceType: "comment_reward",
        type: "deposit",
        createdAt: {
          gte: new Date("2026-07-29T15:00:00.000Z"),
          lt: new Date("2026-07-30T15:00:00.000Z"),
        },
      },
    });
  });

  it("includes only published board assignments and direct assignment-page work", async () => {
    mocks.checkTaskFindMany.mockResolvedValueOnce([
      {
        id: "check-1",
        title: "실내화 검사",
        description: "1인1역할 업무",
        dueDate: new Date("2026-07-31T00:00:00.000Z"),
        createdAt: new Date("2026-07-30T00:00:00.000Z"),
        submissions: [],
      },
    ]);
    mocks.sectionFindMany.mockResolvedValueOnce([
      {
        id: "section-1",
        title: "3단원 생각 쓰기",
        assignmentPublishedAt: new Date("2026-07-29T00:00:00.000Z"),
        assignmentReminderSentAt: null,
        board: { id: "board-1", slug: "korean", title: "국어" },
        cards: [],
      },
    ]);
    mocks.assignmentSlotFindMany.mockResolvedValueOnce([
      {
        id: "slot-1",
        boardId: "assignment-board-1",
        submissionStatus: "assigned",
        dueAt: new Date("2026-08-01T00:00:00.000Z"),
        createdAt: new Date("2026-07-30T00:00:00.000Z"),
        submissionAttempts: [],
        card: null,
        board: { id: "assignment-board-1", slug: "weekend-diary", title: "주말 일기" },
      },
    ]);

    const payload = await getStudentHomePayload({
      ...student,
      classroom: {
        ...student.classroom,
        teacher: { email: "pilot@example.com" },
      },
    });

    expect(payload.assignments).toHaveLength(2);
    expect(payload.assignments.map((item) => item.sectionTitle)).toEqual([
      "3단원 생각 쓰기",
      "주말 일기",
    ]);
    expect(mocks.checkTaskFindMany).not.toHaveBeenCalled();
  });

  it("keeps policy state while returning zero counts for a missing account", async () => {
    mocks.accountFindUnique.mockResolvedValue(null);
    mocks.policyFindUnique.mockResolvedValue({
      readingRewardPerPoint: 5,
      readingDailyRewardCap: 0,
      readingWeeklyRewardCap: 20,
      commentRewardAmount: 5,
      commentDailyRewardCap: 4,
      commentWeeklyRewardCap: 30,
    });

    const payload = await getStudentHomePayload(student);

    expect(payload.dailyRewards).toEqual({
      comment: { earnedCount: 0, dailyCap: 4, complete: false, enabled: true },
    });
    expect(mocks.transactionCount).not.toHaveBeenCalled();
  });
});
