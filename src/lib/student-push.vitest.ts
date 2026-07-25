import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDevices: vi.fn(),
  createDispatch: vi.fn(),
  disableDevices: vi.fn(),
  sendExpoPush: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    studentPushDevice: {
      findMany: mocks.findDevices,
      updateMany: mocks.disableDevices,
    },
    studentPushDispatch: { create: mocks.createDispatch },
  },
}));
vi.mock("@/lib/expo-push", () => ({ sendExpoPush: mocks.sendExpoPush }));

import { dispatchStudentNotificationPush } from "./student-push";

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
