import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ExpoPushSendError,
  expoPushFailureDetails,
  sendExpoPush,
  sendExpoPushMessages,
} from "./expo-push";

const devices = [
  { id: "device-1", expoPushToken: "ExpoPushToken[token1]" },
];
const message = {
  title: "알림",
  body: "새 소식이 있어요.",
  data: { type: "test" },
};

describe("sendExpoPush", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports only batches accepted by Expo as attempted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [{ status: "ok" }] }),
    }));

    await expect(sendExpoPush(devices, message)).resolves.toEqual({
      attempted: 1,
      invalidDeviceIds: [],
    });
  });

  it("throws a sanitized error when Expo rejects the request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const error = await sendExpoPush(devices, message).catch((value) => value);
    expect(error).toBeInstanceOf(ExpoPushSendError);
    expect(expoPushFailureDetails(error)).toEqual({
      reason: "http_error",
      status: 503,
    });
    expect(JSON.stringify(expoPushFailureDetails(error))).not.toContain("token1");
  });

  it("treats malformed or retryable ticket responses as failed sends", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(null),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ status: "error", details: { error: "MessageTooBig" } }],
        }),
      }));

    await expect(sendExpoPush(devices, message)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    await expect(sendExpoPush(devices, message)).rejects.toMatchObject({
      reason: "ticket_error",
    });
  });

  it("splits 2,000 device-specific messages into batches of 100", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const batch = JSON.parse(String(init.body)) as unknown[];
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: batch.map(() => ({ status: "ok" })),
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const envelopes = Array.from({ length: 2_000 }, (_, index) => ({
      device: {
        id: `device-${index}`,
        expoPushToken: `ExpoPushToken[token${index}]`,
      },
      message: {
        title: `알림 ${index}`,
        body: "새 소식이 있어요.",
        data: { type: "test" },
      },
    }));

    await expect(sendExpoPushMessages(envelopes)).resolves.toEqual({
      attempted: 2_000,
      invalidDeviceIds: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });

  it("batches device-specific messages in groups of 100", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)) as unknown[];
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: payload.map(() => ({ status: "ok" })),
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const envelopes = Array.from({ length: 205 }, (_, index) => ({
      device: {
        id: `device-${index}`,
        expoPushToken: `ExpoPushToken[token${index}]`,
      },
      message: {
        title: `알림 ${index}`,
        body: `본문 ${index}`,
        data: { type: "student_notification", href: "/student" },
      },
    }));

    await expect(sendExpoPushMessages(envelopes)).resolves.toEqual({
      attempted: 205,
      invalidDeviceIds: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toHaveLength(100);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toHaveLength(100);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toHaveLength(5);
  });

  it("keeps DeviceNotRegistered terminal and observable for cleanup", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ status: "error", details: { error: "DeviceNotRegistered" } }],
      }),
    }));

    await expect(sendExpoPush(devices, message)).resolves.toEqual({
      attempted: 1,
      invalidDeviceIds: ["device-1"],
    });
  });
});
