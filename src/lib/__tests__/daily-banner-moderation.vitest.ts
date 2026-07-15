import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSubmission: vi.fn(),
  findOwnPublication: vi.fn(),
  transaction: vi.fn(),
  updateMany: vi.fn(),
  findLatest: vi.fn(),
  createPublication: vi.fn(),
  findApproved: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    dailyBannerSubmission: {
      findUnique: mocks.findSubmission,
    },
    dailyBannerPublication: {
      findUnique: mocks.findOwnPublication,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/daily-banner", () => ({
  dateToKstDay: (value: Date) => value.toISOString().slice(0, 10),
  serializeDailyBannerSubmission: (row: { id: string; classroomId: string }) => ({
    id: row.id,
    classroomId: row.classroomId,
  }),
}));

import {
  approveDailyBannerSubmission,
  DailyBannerModerationError,
} from "../daily-banner-moderation";

describe("approveDailyBannerSubmission", () => {
  const targetDay = new Date("2026-07-15T00:00:00.000Z");
  const selected = {
    id: "submission-1",
    classroomId: "classroom-1",
    targetDay,
    status: "pending",
    classroom: { id: "classroom-1", teacherId: "teacher-1" },
    student: { classroomId: "classroom-1" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findSubmission.mockResolvedValue(selected);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.createPublication.mockResolvedValue({
      id: "publication-1",
      classroomId: "classroom-1",
      day: targetDay,
      submissionId: "submission-1",
      approvedById: "teacher-1",
      publishedAt: new Date("2026-07-14T15:00:00.000Z"),
    });
    mocks.findApproved.mockResolvedValue({
      id: "submission-1",
      classroomId: "classroom-1",
    });
    mocks.transaction.mockImplementation(
      async (
        callback: (tx: {
          dailyBannerSubmission: {
            updateMany: typeof mocks.updateMany;
            findUnique: typeof mocks.findLatest;
            findUniqueOrThrow: typeof mocks.findApproved;
          };
          dailyBannerPublication: { create: typeof mocks.createPublication };
        }) => Promise<unknown>,
      ) =>
        callback({
          dailyBannerSubmission: {
            updateMany: mocks.updateMany,
            findUnique: mocks.findLatest,
            findUniqueOrThrow: mocks.findApproved,
          },
          dailyBannerPublication: { create: mocks.createPublication },
        }),
    );
  });

  it("writes the reviewed classroom into the publication transaction", async () => {
    await approveDailyBannerSubmission({
      submissionId: "submission-1",
      classroomId: "classroom-1",
      reviewerId: "teacher-1",
    });

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "submission-1",
          classroomId: "classroom-1",
          status: "pending",
        },
      }),
    );
    expect(mocks.createPublication).toHaveBeenCalledWith({
      data: {
        classroomId: "classroom-1",
        day: targetDay,
        submissionId: "submission-1",
        approvedById: "teacher-1",
      },
    });
  });

  it("returns a classroom-day conflict when another submission wins", async () => {
    mocks.transaction.mockRejectedValueOnce({ code: "P2002" });
    mocks.findOwnPublication.mockResolvedValueOnce(null);

    await expect(
      approveDailyBannerSubmission({
        submissionId: "submission-1",
        classroomId: "classroom-1",
        reviewerId: "teacher-1",
      }),
    ).rejects.toMatchObject<Partial<DailyBannerModerationError>>({
      code: "day_already_published",
      status: 409,
    });
  });
});
