import "server-only";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

export type ExpoPushDevice = {
  id: string;
  expoPushToken: string;
};

export type ExpoPushMessage = {
  title: string;
  body: string;
  data: Record<string, string>;
};

type ExpoTicket = {
  status?: string;
  details?: { error?: string };
};

export class ExpoPushSendError extends Error {
  readonly reason: "http_error" | "invalid_response" | "ticket_error" | "request_error";
  readonly status?: number;

  constructor(
    reason: ExpoPushSendError["reason"],
    options: { status?: number } = {},
  ) {
    super(`expo_push_${reason}`);
    this.name = "ExpoPushSendError";
    this.reason = reason;
    this.status = options.status;
  }
}

export function expoPushFailureDetails(error: unknown): {
  reason: string;
  status?: number;
} {
  if (error instanceof ExpoPushSendError) {
    return {
      reason: error.reason,
      ...(error.status == null ? {} : { status: error.status }),
    };
  }
  return { reason: "unexpected_error" };
}

export async function sendExpoPush(
  devices: ExpoPushDevice[],
  message: ExpoPushMessage,
): Promise<{ attempted: number; invalidDeviceIds: string[] }> {
  let attempted = 0;
  const invalidDeviceIds: string[] = [];

  for (let start = 0; start < devices.length; start += EXPO_BATCH_SIZE) {
    const batch = devices.slice(start, start + EXPO_BATCH_SIZE);
    try {
      const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        signal: AbortSignal.timeout(5_000),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(
          batch.map((device) => ({
            to: device.expoPushToken,
            sound: "default",
            title: message.title,
            body: message.body,
            data: message.data,
          })),
        ),
      });
      if (!response.ok) {
        throw new ExpoPushSendError("http_error", { status: response.status });
      }
      const payload = (await response.json().catch(() => null)) as
        | { data?: ExpoTicket[] }
        | null;
      if (!Array.isArray(payload?.data) || payload.data.length !== batch.length) {
        throw new ExpoPushSendError("invalid_response");
      }
      let hasRetryableTicketError = false;
      batch.forEach((device, index) => {
        const ticket = payload.data?.[index];
        if (ticket?.details?.error === "DeviceNotRegistered") {
          invalidDeviceIds.push(device.id);
        } else if (ticket?.status !== "ok") {
          hasRetryableTicketError = true;
        }
      });
      if (hasRetryableTicketError) {
        throw new ExpoPushSendError("ticket_error");
      }
      attempted += batch.length;
    } catch (error) {
      if (error instanceof ExpoPushSendError) throw error;
      throw new ExpoPushSendError("request_error");
    }
  }

  return { attempted, invalidDeviceIds };
}
