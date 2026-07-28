import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ExpoPushSendError,
  expoPushFailureDetails,
  sendExpoPush,
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
