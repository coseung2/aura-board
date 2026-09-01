import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDevices: vi.fn(),
  countDevices: vi.fn(),
  createDispatch: vi.fn(),
  createManyDispatches: vi.fn(),
  deleteDispatch: vi.fn(),
  deleteManyDispatches: vi.fn(),
  disableDevices: vi.fn(),
  upsertNotification: vi.fn(),
  createManyNotifications: vi.fn(),
  findManyNotifications: vi.fn(),
  sendExpoPush: vi.fn(),
  sendExpoPushMessages: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    studentPushDevice: {
      findMany: mocks.findDevices,
      count: mocks.countDevices,
      updateMany: mocks.disableDevices,
    },
    studentPushDispatch: {
      create: mocks.createDispatch,
      createManyAndReturn: mocks.createManyDispatches,
      delete: mocks.deleteDispatch,
      deleteMany: mocks.deleteManyDispatches,
    },
    studentNotification: {
      upsert: mocks.upsertNotification,
      createMany: mocks.createManyNotifications,
      findMany: mocks.findManyNotifications,
    },
  },
}));
vi.mock("@/lib/expo-push", () => ({
  sendExpoPush: mocks.sendExpoPush,
  sendExpoPushMessages: mocks.sendExpoPushMessages,
  expoPushFailureDetails: () => ({ reason: "request_error" }),
}));

import {
  assignmentDistributedPush,
  afternoonTaskReminderPush,
  attendanceReminderPush,
  dispatchStudentNotificationPush,
  dispatchStudentNotificationPushBatch,
  morningTaskReminderPush,
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
    mocks.deleteDispatch.mockResolvedValue({ id: "dispatch-1" });
    mocks.deleteManyDispatches.mockResolvedValue({ count: 0 });
    mocks.createManyNotifications.mockResolvedValue({ count: 0 });
    mocks.createManyDispatches.mockResolvedValue([]);
    mocks.sendExpoPush.mockResolvedValue({ attempted: 1, invalidDeviceIds: [] });
    mocks.sendExpoPushMessages.mockResolvedValue({ attempted: 0, invalidDeviceIds: [] });
    mocks.disableDevices.mockResolvedValue({ count: 0 });
    mocks.upsertNotification.mockResolvedValue({
      kind: input.kind,
      title: input.title,
      content: input.body,
      href: input.href,
    });
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
    expect(mocks.upsertNotification).toHaveBeenCalledWith({
      where: {
        studentId_eventKey: {
          studentId: input.studentId,
          eventKey: input.eventKey,
        },
      },
      create: expect.objectContaining({
        studentId: input.studentId,
        eventKey: input.eventKey,
        sourceId: "comment-1",
        kind: "comment",
      }),
      update: {},
      select: {
        kind: true,
        title: true,
        content: true,
        href: true,
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

  it("sends an existing notification center row as the canonical push payload", async () => {
    mocks.upsertNotification.mockResolvedValue({
      kind: "reward",
      title: "독서 보상",
      content: "책을 읽어 보상을 받았어요.",
      href: "/my/wallet",
    });

    await dispatchStudentNotificationPush({
      ...input,
      eventKey: "reward:transaction-1",
      sourceId: "transaction-1",
      kind: "wallet",
      title: "500원이 들어왔어요",
      body: "현재 잔액은 1,500원이에요.",
    });

    expect(mocks.createDispatch).toHaveBeenCalledWith({
      data: {
        studentId: input.studentId,
        eventKey: "reward:transaction-1",
        kind: "reward",
        title: "독서 보상",
        body: "책을 읽어 보상을 받았어요.",
        href: "/my/wallet",
      },
    });
    expect(mocks.sendExpoPush).toHaveBeenCalledWith(
      [{ id: "device-1", expoPushToken: "ExpoPushToken[token1]" }],
      {
        title: "독서 보상",
        body: "책을 읽어 보상을 받았어요.",
        data: {
          type: "student_notification",
          kind: "reward",
          href: "/my/wallet",
        },
      },
    );
  });

  it("keeps the confirmed reservation and suppresses a later duplicate", async () => {
    let reserved = false;
    mocks.createDispatch.mockImplementation(async () => {
      if (reserved) {
        throw Object.assign(new Error("duplicate"), { code: "P2002" });
      }
      reserved = true;
      return { id: "dispatch-1" };
    });

    await expect(dispatchStudentNotificationPush(input)).resolves.toEqual({
      attempted: 1,
      skipped: 0,
    });
    await expect(dispatchStudentNotificationPush(input)).resolves.toEqual({
      attempted: 0,
      skipped: 1,
    });
    expect(mocks.sendExpoPush).toHaveBeenCalledOnce();
    expect(mocks.deleteDispatch).not.toHaveBeenCalled();
  });

  it("releases a failed send so the same event can be retried", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.sendExpoPush
      .mockRejectedValueOnce(new Error("secret token must not be logged"))
      .mockResolvedValueOnce({ attempted: 1, invalidDeviceIds: [] });

    await expect(dispatchStudentNotificationPush(input)).resolves.toEqual({
      attempted: 0,
      skipped: 0,
    });
    expect(mocks.deleteDispatch).toHaveBeenCalledWith({
      where: { id: "dispatch-1" },
    });

    await expect(dispatchStudentNotificationPush(input)).resolves.toEqual({
      attempted: 1,
      skipped: 0,
    });
    expect(mocks.createDispatch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("secret token");
  });

  it("allows only the reservation winner to send while callers overlap", async () => {
    let reserved = false;
    let finishSend!: (value: { attempted: number; invalidDeviceIds: string[] }) => void;
    mocks.createDispatch.mockImplementation(async () => {
      if (reserved) {
        throw Object.assign(new Error("duplicate"), { code: "P2002" });
      }
      reserved = true;
      return { id: "dispatch-1" };
    });
    mocks.sendExpoPush.mockImplementationOnce(
      () => new Promise((resolve) => { finishSend = resolve; }),
    );

    const first = dispatchStudentNotificationPush(input);
    await vi.waitFor(() => expect(mocks.sendExpoPush).toHaveBeenCalledOnce());
    const second = dispatchStudentNotificationPush(input);

    await expect(second).resolves.toEqual({ attempted: 0, skipped: 1 });
    finishSend({ attempted: 1, invalidDeviceIds: [] });
    await expect(first).resolves.toEqual({ attempted: 1, skipped: 0 });
    expect(mocks.sendExpoPush).toHaveBeenCalledOnce();
  });

  it("persists the notification center event even without an active device", async () => {
    mocks.findDevices.mockResolvedValue([]);

    await expect(dispatchStudentNotificationPush(input)).resolves.toEqual({
      attempted: 0,
      skipped: 0,
    });

    expect(mocks.createDispatch).toHaveBeenCalledOnce();
    expect(mocks.sendExpoPush).not.toHaveBeenCalled();
    expect(mocks.deleteDispatch).toHaveBeenCalledWith({
      where: { id: "dispatch-1" },
    });
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

describe("dispatchStudentNotificationPushBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createManyNotifications.mockResolvedValue({ count: 2 });
    mocks.findManyNotifications.mockResolvedValue([
      {
        studentId: "student-1",
        eventKey: "morning-tasks:student-1:2026-08-07",
        kind: "attendance",
        title: "오늘 출석을 확인해 주세요",
        content: "오늘 출석을 확인해 주세요.",
        href: "/student",
      },
      {
        studentId: "student-2",
        eventKey: "morning-tasks:student-2:2026-08-07",
        kind: "attendance",
        title: "오늘 출석을 확인해 주세요",
        content: "오늘 출석을 확인해 주세요.",
        href: "/student",
      },
    ]);
    mocks.createManyDispatches.mockResolvedValue([
      { id: "dispatch-1", studentId: "student-1", eventKey: "morning-tasks:student-1:2026-08-07" },
      { id: "dispatch-2", studentId: "student-2", eventKey: "morning-tasks:student-2:2026-08-07" },
    ]);
    mocks.findDevices.mockResolvedValue([
      { id: "device-1", studentId: "student-1", expoPushToken: "ExpoPushToken[token1]" },
      { id: "device-2", studentId: "student-2", expoPushToken: "ExpoPushToken[token2]" },
    ]);
    mocks.sendExpoPushMessages.mockResolvedValue({ attempted: 2, invalidDeviceIds: [] });
    mocks.disableDevices.mockResolvedValue({ count: 0 });
  });

  it("reserves many students together and delegates one device-specific batch", async () => {
    const pushes = ["student-1", "student-2"].map((studentId) =>
      morningTaskReminderPush({ studentId, day: "2026-08-07" }),
    );

    await expect(dispatchStudentNotificationPushBatch(pushes)).resolves.toEqual({
      attempted: 2,
      skipped: 0,
      reserved: 2,
    });
    expect(mocks.createManyNotifications).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ studentId: "student-1", title: "오늘 출석을 확인해 주세요" }),
        expect.objectContaining({ studentId: "student-2", title: "오늘 출석을 확인해 주세요" }),
      ]),
      skipDuplicates: true,
    });
    expect(mocks.createManyDispatches).toHaveBeenCalledOnce();
    expect(mocks.sendExpoPushMessages).toHaveBeenCalledWith([
      expect.objectContaining({ device: expect.objectContaining({ id: "device-1" }) }),
      expect.objectContaining({ device: expect.objectContaining({ id: "device-2" }) }),
    ]);
  });

  it("uses stored notification rows as the canonical batch push payloads", async () => {
    const push = morningTaskReminderPush({
      studentId: "student-1",
      day: "2026-08-07",
    });
    mocks.findManyNotifications.mockResolvedValue([
      {
        studentId: "student-1",
        eventKey: push.eventKey,
        kind: "assignment",
        title: "저장된 알림 제목",
        content: "저장된 알림 내용",
        href: "/board/stored-board",
      },
    ]);
    mocks.createManyDispatches.mockResolvedValue([
      { id: "dispatch-1", studentId: "student-1", eventKey: push.eventKey },
    ]);
    mocks.findDevices.mockResolvedValue([
      { id: "device-1", studentId: "student-1", expoPushToken: "ExpoPushToken[token1]" },
    ]);

    await dispatchStudentNotificationPushBatch([push]);

    expect(mocks.createManyDispatches).toHaveBeenCalledWith({
      data: [{
        studentId: "student-1",
        eventKey: push.eventKey,
        kind: "assignment",
        title: "저장된 알림 제목",
        body: "저장된 알림 내용",
        href: "/board/stored-board",
      }],
      skipDuplicates: true,
      select: { id: true, studentId: true, eventKey: true },
    });
    expect(mocks.sendExpoPushMessages).toHaveBeenCalledWith([
      {
        device: { id: "device-1", expoPushToken: "ExpoPushToken[token1]" },
        message: {
          title: "저장된 알림 제목",
          body: "저장된 알림 내용",
          data: {
            type: "student_notification",
            kind: "assignment",
            href: "/board/stored-board",
          },
        },
      },
    ]);
  });

  it("releases reservations when no student has a registered device", async () => {
    mocks.findDevices.mockResolvedValue([]);
    const pushes = ["student-1", "student-2"].map((studentId) =>
      morningTaskReminderPush({ studentId, day: "2026-08-07" }),
    );

    await expect(dispatchStudentNotificationPushBatch(pushes)).resolves.toEqual({
      attempted: 0,
      skipped: 0,
      reserved: 0,
    });
    expect(mocks.deleteManyDispatches).toHaveBeenCalledWith({
      where: { id: { in: ["dispatch-1", "dispatch-2"] } },
    });
    expect(mocks.sendExpoPushMessages).not.toHaveBeenCalled();
  });

  it("releases only no-device reservations in a mixed batch", async () => {
    mocks.findDevices.mockResolvedValue([
      { id: "device-1", studentId: "student-1", expoPushToken: "ExpoPushToken[token1]" },
    ]);
    mocks.sendExpoPushMessages.mockResolvedValue({ attempted: 1, invalidDeviceIds: [] });
    const pushes = ["student-1", "student-2"].map((studentId) =>
      morningTaskReminderPush({ studentId, day: "2026-08-07" }),
    );

    await expect(dispatchStudentNotificationPushBatch(pushes)).resolves.toEqual({
      attempted: 1,
      skipped: 0,
      reserved: 1,
    });
    expect(mocks.deleteManyDispatches).toHaveBeenCalledWith({
      where: { id: { in: ["dispatch-2"] } },
    });
    expect(mocks.sendExpoPushMessages).toHaveBeenCalledWith([
      expect.objectContaining({ device: expect.objectContaining({ id: "device-1" }) }),
    ]);
  });
});

describe("student push event builders", () => {
  it("uses the KST calendar day in stable per-student attendance keys", () => {
    const beforeKstMidnight = new Date("2026-07-25T14:59:59.999Z");
    const afterKstMidnight = new Date("2026-07-25T15:00:00.000Z");

    expect(studentPushKstDay(beforeKstMidnight)).toBe("2026-07-25");
    expect(studentPushKstDay(afterKstMidnight)).toBe("2026-07-26");
    expect(attendanceReminderPush("student-1", "2026-07-26")).toMatchObject({
      eventKey: "morning-tasks:student-1:2026-07-26",
      studentId: "student-1",
      kind: "attendance",
      href: "/student",
    });
    expect(shouldSendAttendanceReminder(new Date("2026-07-25T22:49:59.999Z"))).toBe(false);
    expect(shouldSendAttendanceReminder(new Date("2026-07-25T22:50:00.000Z"))).toBe(true);
  });

  it("writes each due-today assignment as a sentence without middle-dot separators", () => {
    const push = morningTaskReminderPush({
      studentId: "student-1",
      assignments: [
        {
          boardTitle: "과학 관찰 기록",
          boardSlug: "science",
          dueAt: new Date("2026-08-01T07:00:00.000Z"),
        },
        {
          boardTitle: "독서 기록",
          boardSlug: "reading",
          dueAt: new Date("2026-08-01T11:00:00.000Z"),
        },
      ],
      day: "2026-08-01",
    });

    expect(push.body).toContain("과학 관찰 기록 과제의 마감이 오늘 오후 4시까지예요.");
    expect(push.body).toContain("독서 기록 과제의 마감이 오늘 오후 8시까지예요.");
    expect(push.body).not.toContain("·");
  });

  it("builds an afternoon attendance digest with optional assignment context", () => {
    const push = afternoonTaskReminderPush({
      studentId: "student-1",
      day: "2026-08-01",
      assignments: [{
        boardTitle: "과학 관찰 기록",
        boardSlug: "science",
        dueAt: new Date("2026-08-01T07:00:00.000Z"),
      }],
    });

    expect(push).toMatchObject({
      eventKey: "afternoon-tasks:student-1:2026-08-01",
      studentId: "student-1",
      kind: "attendance",
      href: "/student",
      title: "오후 출석과 과제를 확인해 주세요",
    });
    expect(push.body).toContain("출석 보상을 받을 수 있어요.");
    expect(push.body).toContain("과학 관찰 기록 과제의 마감이 오늘 오후 4시까지예요.");
  });

  it("keeps the attendance reward guidance when no assignment is missing", () => {
    const push = afternoonTaskReminderPush({
      studentId: "student-1",
      day: "2026-08-01",
    });

    expect(push).toMatchObject({
      eventKey: "afternoon-tasks:student-1:2026-08-01",
      title: "오후 출석 보상을 확인해 주세요",
      href: "/student",
    });
    expect(push.body).toContain("오늘 아직 출석하지 않았어요.");
    expect(push.body).toContain("출석 보상을 받을 수 있어요.");
    expect(push.body).not.toContain("아직 제출하지 않은 과제가");
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
