import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDevices: vi.fn(),
  countDevices: vi.fn(),
  createDispatch: vi.fn(),
  disableDevices: vi.fn(),
  sendExpoPush: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    studentPushDevice: {
      findMany: mocks.findDevices,
      count: mocks.countDevices,
      updateMany: mocks.disableDevices,
    },
    studentPushDispatch: { create: mocks.createDispatch },
  },
}));
vi.mock("@/lib/expo-push", () => ({ sendExpoPush: mocks.sendExpoPush }));

import {
  assignmentDistributedPush,
  attendanceReminderPush,
  dispatchStudentNotificationPush,
  shouldSendAttendanceReminder,
  studentPushKstDay,
} from "./student-push";

const input = {
  eventKey: "comment:comment-1",
  studentId: "student-1",
  kind: "comment" as const,
  title: "게시물에 새 댓글이 달렸어요",
  body: "선생님: 잘했어요",
  href: "/board/class-board",
};

describe("dispatchStudentNotificationPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findDevices.mockResolvedValue([
      { id: "device-1", expoPushToken: "ExpoPushToken[token1]" },
    ]);
    mocks.countDevices.mockResolvedValue(1);
    mocks.createDispatch.mockResolvedValue({ id: "dispatch-1" });
    mocks.sendExpoPush.mockResolvedValue({ attempted: 1, invalidDeviceIds: [] });
    mocks.disableDevices.mockResolvedValue({ count: 0 });
  });

  it("sends a typed student notification payload to active devices", async () => {
    await expect(dispatchStudentNotificationPush(input)).resolves.toEqual({
      attempted: 1,
      skipped: 0,
    });
    expect(mocks.findDevices).toHaveBeenCalledWith({
      where: { studentId: "student-1", disabledAt: null },
      select: { id: true, expoPushToken: true },
    });
    expect(mocks.createDispatch).toHaveBeenCalledWith({
      data: {
        studentId: input.studentId,
        eventKey: input.eventKey,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href,
      },
    });
    expect(mocks.sendExpoPush).toHaveBeenCalledWith(
      [{ id: "device-1", expoPushToken: "ExpoPushToken[token1]" }],
      {
        title: input.title,
        body: input.body,
        data: {
          type: "student_notification",
          kind: "comment",
          href: "/board/class-board",
        },
      },
    );
  });

  it("deduplicates the same event for the same student", async () => {
    mocks.createDispatch.mockRejectedValue(
      Object.assign(new Error("duplicate"), { code: "P2002" }),
    );

    await expect(dispatchStudentNotificationPush(input)).resolves.toEqual({
      attempted: 0,
      skipped: 1,
    });
    expect(mocks.sendExpoPush).not.toHaveBeenCalled();
  });

  it("persists the notification center event even without an active device", async () => {
    mocks.findDevices.mockResolvedValue([]);

    await expect(dispatchStudentNotificationPush(input)).resolves.toEqual({
      attempted: 0,
      skipped: 0,
    });

    expect(mocks.createDispatch).toHaveBeenCalledOnce();
    expect(mocks.sendExpoPush).not.toHaveBeenCalled();
  });

  it("disables Expo tokens reported as unregistered", async () => {
    mocks.sendExpoPush.mockResolvedValue({
      attempted: 1,
      invalidDeviceIds: ["device-1"],
    });

    await dispatchStudentNotificationPush(input);
    expect(mocks.disableDevices).toHaveBeenCalledWith({
      where: { id: { in: ["device-1"] } },
      data: { disabledAt: expect.any(Date) },
    });
  });
});

describe("student push event builders", () => {
  it("uses the KST calendar day in stable per-student attendance keys", () => {
    const beforeKstMidnight = new Date("2026-07-25T14:59:59.999Z");
    const afterKstMidnight = new Date("2026-07-25T15:00:00.000Z");

    expect(studentPushKstDay(beforeKstMidnight)).toBe("2026-07-25");
    expect(studentPushKstDay(afterKstMidnight)).toBe("2026-07-26");
    expect(attendanceReminderPush("student-1", "2026-07-26")).toMatchObject({
      eventKey: "attendance-missing:student-1:2026-07-26",
      studentId: "student-1",
      kind: "attendance",
      href: "/student",
    });
    expect(shouldSendAttendanceReminder(new Date("2026-07-25T22:59:59.999Z"))).toBe(false);
    expect(shouldSendAttendanceReminder(new Date("2026-07-25T23:00:00.000Z"))).toBe(true);
  });

  it("uses the slot identity and assigned board link", () => {
    expect(
      assignmentDistributedPush({
        slotId: "slot-1",
        studentId: "student-1",
        boardSlug: "summer homework",
        boardTitle: "여름 과제",
      }),
    ).toMatchObject({
      eventKey: "assignment-distributed:slot-1",
      studentId: "student-1",
      kind: "assignment",
      href: "/board/summer%20homework",
    });
  });
});
