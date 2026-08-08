import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLinks: vi.fn(),
  findDevices: vi.fn(),
  createDispatch: vi.fn(),
  deleteDispatch: vi.fn(),
  disableDevices: vi.fn(),
  sendExpoPush: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    parentChildLink: { findMany: mocks.findLinks },
    parentPushDispatch: {
      create: mocks.createDispatch,
      delete: mocks.deleteDispatch,
    },
    parentPushDevice: {
      findMany: mocks.findDevices,
      updateMany: mocks.disableDevices,
    },
  },
}));
vi.mock("@/lib/expo-push", () => ({
  sendExpoPush: mocks.sendExpoPush,
  expoPushFailureDetails: () => ({ reason: "request_error" }),
}));

import {
  dispatchLinkedParentCardPush,
  dispatchLinkedParentCardPushBatch,
  dispatchParentNotificationPush,
} from "./parent-push";

const directInput = {
  eventKey: "attendance:student-1:2026-07-28",
  parentId: "parent-1",
  title: "출석 알림",
  body: "출석을 확인해 주세요.",
  data: { type: "student_attendance" },
};

const linkedInput = {
  eventKey: "card:card-1",
  studentId: "student-1",
  studentName: "하늘",
  boardId: "board-1",
  boardTitle: "우리 반 이야기",
  cardId: "card-1",
};

const device = { id: "device-1", expoPushToken: "ExpoPushToken[token1]" };

describe("parent push dispatch reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findDevices.mockResolvedValue([device]);
    mocks.findLinks.mockResolvedValue([
      { parent: { id: "parent-1", pushDevices: [device] } },
    ]);
    mocks.createDispatch.mockResolvedValue({ id: "dispatch-1" });
    mocks.deleteDispatch.mockResolvedValue({ id: "dispatch-1" });
    mocks.disableDevices.mockResolvedValue({ count: 0 });
    mocks.sendExpoPush.mockResolvedValue({ attempted: 1, invalidDeviceIds: [] });
  });

  it("keeps a confirmed direct-send reservation and suppresses a later duplicate", async () => {
    let reserved = false;
    mocks.createDispatch.mockImplementation(async () => {
      if (reserved) {
        throw Object.assign(new Error("duplicate"), { code: "P2002" });
      }
      reserved = true;
      return { id: "dispatch-1" };
    });

    await expect(dispatchParentNotificationPush(directInput)).resolves.toEqual({
      attempted: 1,
      skipped: 0,
    });
    await expect(dispatchParentNotificationPush(directInput)).resolves.toEqual({
      attempted: 0,
      skipped: 1,
    });
    expect(mocks.sendExpoPush).toHaveBeenCalledOnce();
    expect(mocks.deleteDispatch).not.toHaveBeenCalled();
  });

  it("releases a failed direct send so the same parent event can retry", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.sendExpoPush
      .mockRejectedValueOnce(new Error("ExpoPushToken[secret]"))
      .mockResolvedValueOnce({ attempted: 1, invalidDeviceIds: [] });

    await expect(dispatchParentNotificationPush(directInput)).resolves.toEqual({
      attempted: 0,
      skipped: 0,
    });
    expect(mocks.deleteDispatch).toHaveBeenCalledWith({
      where: { id: "dispatch-1" },
    });
    await expect(dispatchParentNotificationPush(directInput)).resolves.toEqual({
      attempted: 1,
      skipped: 0,
    });
    expect(mocks.createDispatch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("ExpoPushToken[secret]");
  });

  it("allows only the parent reservation winner to send while callers overlap", async () => {
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

    const first = dispatchParentNotificationPush(directInput);
    await vi.waitFor(() => expect(mocks.sendExpoPush).toHaveBeenCalledOnce());
    const second = dispatchParentNotificationPush(directInput);

    await expect(second).resolves.toEqual({ attempted: 0, skipped: 1 });
    finishSend({ attempted: 1, invalidDeviceIds: [] });
    await expect(first).resolves.toEqual({ attempted: 1, skipped: 0 });
    expect(mocks.sendExpoPush).toHaveBeenCalledOnce();
  });

  it("uses the same shared send contract for linked-parent notifications", async () => {
    await expect(dispatchLinkedParentCardPush(linkedInput)).resolves.toEqual({
      attempted: 1,
      skipped: 0,
    });
    expect(mocks.findLinks).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: "student-1",
          status: "active",
          deletedAt: null,
          parent: { parentDeletedAt: null },
        },
      }),
    );
    expect(mocks.sendExpoPush).toHaveBeenCalledWith([device], {
      title: "하늘 학생이 새 글을 올렸어요",
      body: "우리 반 이야기 보드에서 확인해 보세요.",
      data: {
        type: "child_card_created",
        studentId: "student-1",
        boardId: "board-1",
        cardId: "card-1",
      },
    });
  });

  it("loads linked parents once for a batch of student card events", async () => {
    const secondInput = {
      ...linkedInput,
      eventKey: "card:card-2",
      studentId: "student-2",
      studentName: "바다",
      cardId: "card-2",
    };
    mocks.findLinks.mockResolvedValue([
      {
        studentId: "student-1",
        parent: { id: "parent-1", pushDevices: [device] },
      },
      {
        studentId: "student-2",
        parent: { id: "parent-2", pushDevices: [] },
      },
    ]);

    await expect(
      dispatchLinkedParentCardPushBatch([linkedInput, secondInput]),
    ).resolves.toEqual({ attempted: 1, skipped: 0 });
    expect(mocks.findLinks).toHaveBeenCalledTimes(1);
    expect(mocks.findLinks).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId: { in: ["student-1", "student-2"] },
          status: "active",
          deletedAt: null,
          parent: { parentDeletedAt: null },
        },
      }),
    );
    expect(mocks.sendExpoPush).toHaveBeenCalledTimes(1);
  });

  it("releases a linked-parent reservation after an external send failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.sendExpoPush.mockRejectedValueOnce(new Error("network unavailable"));

    await expect(dispatchLinkedParentCardPush(linkedInput)).resolves.toEqual({
      attempted: 0,
      skipped: 0,
    });
    expect(mocks.deleteDispatch).toHaveBeenCalledWith({
      where: { id: "dispatch-1" },
    });
  });

  it("disables unregistered parent devices after a confirmed request", async () => {
    mocks.sendExpoPush.mockResolvedValue({
      attempted: 1,
      invalidDeviceIds: ["device-1"],
    });

    await dispatchParentNotificationPush(directInput);
    expect(mocks.disableDevices).toHaveBeenCalledWith({
      where: { id: { in: ["device-1"] } },
      data: { disabledAt: expect.any(Date) },
    });
  });
});
