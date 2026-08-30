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
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [{ status: "ok", id: "ticket-1" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: { "ticket-1": { status: "ok" } } }),
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
    const ticketError = await sendExpoPush(devices, message).catch((value) => value);
    expect(ticketError).toBeInstanceOf(ExpoPushSendError);
    expect(expoPushFailureDetails(ticketError)).toEqual({
      reason: "ticket_error",
      ticketErrors: { MessageTooBig: 1 },
    });
  });

  it("logs only bounded ticket error codes and counts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [
          {
            status: "error",
            details: { error: "InvalidCredentials" },
          },
        ],
      }),
    }));

    const error = await sendExpoPush(devices, message).catch((value) => value);
    expect(expoPushFailureDetails(error)).toEqual({
      reason: "ticket_error",
      ticketErrors: { InvalidCredentials: 1 },
    });
    expect(JSON.stringify(expoPushFailureDetails(error))).not.toContain("token1");
  });

  it("splits 2,000 device-specific messages into batches of 100", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url, init: RequestInit) => {
      const batch = JSON.parse(String(init.body)) as unknown[];
      if (String(url).includes("getReceipts")) {
        const ids = (batch as unknown as { ids: string[] }).ids;
        return { ok: true, json: vi.fn().mockResolvedValue({ data: Object.fromEntries(ids.map((id) => [id, { status: "ok" }])) }) };
      }
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: batch.map((_, index) => ({ status: "ok", id: `ticket-${index}` })),
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
    expect(fetchMock).toHaveBeenCalledTimes(40);
  });

  it("batches device-specific messages in groups of 100", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)) as unknown[];
      if (String(url).includes("getReceipts")) {
        const ids = (payload as unknown as { ids: string[] }).ids;
        return { ok: true, json: vi.fn().mockResolvedValue({ data: Object.fromEntries(ids.map((id) => [id, { status: "ok" }])) }) };
      }
      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: payload.map((_, index) => ({ status: "ok", id: `ticket-${index}` })),
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
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toHaveLength(100);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toHaveLength(100);
    expect(JSON.parse(String(fetchMock.mock.calls[4][1]?.body))).toHaveLength(5);
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

  it("surfaces final receipt errors without exposing tokens", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [{ status: "ok", id: "ticket-1" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { "ticket-1": { status: "error", details: { error: "MismatchSenderId" } } },
        }),
      }));

    const error = await sendExpoPush(devices, message).catch((value) => value);
    expect(expoPushFailureDetails(error)).toEqual({
      reason: "receipt_error",
      receiptErrors: { MismatchSenderId: 1 },
    });
    expect(JSON.stringify(expoPushFailureDetails(error))).not.toContain("token1");
  });

  it("returns receipt-level unregistered devices for cleanup", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [{ status: "ok", id: "ticket-1" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { "ticket-1": { status: "error", details: { error: "DeviceNotRegistered" } } },
        }),
      }));

    await expect(sendExpoPush(devices, message)).resolves.toEqual({
      attempted: 1,
      invalidDeviceIds: ["device-1"],
    });
  });
});
