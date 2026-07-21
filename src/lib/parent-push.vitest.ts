import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLinks: vi.fn(),
  createDispatch: vi.fn(),
  disableDevices: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    parentChildLink: { findMany: mocks.findLinks },
    parentPushDispatch: { create: mocks.createDispatch },
    parentPushDevice: { updateMany: mocks.disableDevices },
  },
}));

import { dispatchLinkedParentCardPush } from "./parent-push";

const input = {
  eventKey: "card:card-1",
  studentId: "student-1",
  studentName: "하늘",
  boardId: "board-1",
  boardTitle: "우리 반 이야기",
  cardId: "card-1",
};

describe("dispatchLinkedParentCardPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [{ status: "ok" }] }),
    }));
    mocks.createDispatch.mockResolvedValue({ id: "dispatch-1" });
    mocks.disableDevices.mockResolvedValue({ count: 0 });
  });

  it("targets only active, non-deleted links and sends registered parent devices", async () => {
    mocks.findLinks.mockResolvedValue([
      {
        parent: {
          id: "parent-1",
          pushDevices: [{ id: "device-1", expoPushToken: "ExpoPushToken[token1]" }],
        },
      },
    ]);

    await expect(dispatchLinkedParentCardPush(input)).resolves.toEqual({
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
    expect(fetch).toHaveBeenCalledOnce();
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual([
      expect.objectContaining({
        to: "ExpoPushToken[token1]",
        data: expect.objectContaining({ studentId: "student-1", cardId: "card-1" }),
      }),
    ]);
  });

  it("does not resend an event already claimed for the parent", async () => {
    mocks.findLinks.mockResolvedValue([
      {
        parent: {
          id: "parent-1",
          pushDevices: [{ id: "device-1", expoPushToken: "ExpoPushToken[token1]" }],
        },
      },
    ]);
    mocks.createDispatch.mockRejectedValue(Object.assign(new Error("duplicate"), { code: "P2002" }));

    await expect(dispatchLinkedParentCardPush(input)).resolves.toEqual({
      attempted: 0,
      skipped: 1,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps Expo failures non-fatal and disables unregistered devices", async () => {
    mocks.findLinks.mockResolvedValue([
      {
        parent: {
          id: "parent-1",
          pushDevices: [{ id: "device-1", expoPushToken: "ExpoPushToken[token1]" }],
        },
      },
    ]);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ status: "error", details: { error: "DeviceNotRegistered" } }],
      }),
    } as unknown as Response);

    await expect(dispatchLinkedParentCardPush(input)).resolves.toEqual({
      attempted: 1,
      skipped: 0,
    });
    expect(mocks.disableDevices).toHaveBeenCalledWith({
      where: { id: { in: ["device-1"] } },
      data: { disabledAt: expect.any(Date) },
    });
  });

  it("does not fail card creation when the Expo request is unavailable", async () => {
    mocks.findLinks.mockResolvedValue([
      {
        parent: {
          id: "parent-1",
          pushDevices: [{ id: "device-1", expoPushToken: "ExpoPushToken[token1]" }],
        },
      },
    ]);
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network unavailable"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(dispatchLinkedParentCardPush(input)).resolves.toEqual({
      attempted: 1,
      skipped: 0,
    });
  });
});
