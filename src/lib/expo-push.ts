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

export type ExpoPushEnvelope = {
  device: ExpoPushDevice;
  message: ExpoPushMessage;
};

type ExpoTicket = {
  id?: string;
  status?: string;
  details?: { error?: string };
};

export class ExpoPushSendError extends Error {
  readonly reason: "http_error" | "invalid_response" | "ticket_error" | "request_error";
  readonly status?: number;
  readonly ticketErrors?: Readonly<Record<string, number>>;

  constructor(
    reason: ExpoPushSendError["reason"],
    options: {
      status?: number;
      ticketErrors?: Readonly<Record<string, number>>;
    } = {},
  ) {
    super(`expo_push_${reason}`);
    this.name = "ExpoPushSendError";
    this.reason = reason;
    this.status = options.status;
    this.ticketErrors = options.ticketErrors;
  }
}

export function expoPushFailureDetails(error: unknown): {
  reason: string;
  status?: number;
  ticketErrors?: Readonly<Record<string, number>>;
} {
  if (error instanceof ExpoPushSendError) {
    return {
      reason: error.reason,
      ...(error.status == null ? {} : { status: error.status }),
      ...(error.ticketErrors == null
        ? {}
        : { ticketErrors: error.ticketErrors }),
    };
  }
  return { reason: "unexpected_error" };
}

export async function sendExpoPush(
  devices: ExpoPushDevice[],
  message: ExpoPushMessage,
): Promise<{ attempted: number; invalidDeviceIds: string[] }> {
  return sendExpoPushMessages(devices.map((device) => ({ device, message })));
}

/**
 * Sends device-specific messages in Expo's maximum batch size. This is used by
 * the 08:00 student digest so 2,000 active devices become about 20 outbound
 * requests instead of one request per student.
 */
export async function sendExpoPushMessages(
  envelopes: ExpoPushEnvelope[],
): Promise<{ attempted: number; invalidDeviceIds: string[] }> {
  let attempted = 0;
  const invalidDeviceIds: string[] = [];

  for (let start = 0; start < envelopes.length; start += EXPO_BATCH_SIZE) {
    const batch = envelopes.slice(start, start + EXPO_BATCH_SIZE);
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
          batch.map(({ device, message }) => ({
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
      const retryableTicketErrors: Record<string, number> = {};
      let missingTicketId = false;
      batch.forEach(({ device }, index) => {
        const ticket = payload.data?.[index];
        if (ticket?.details?.error === "DeviceNotRegistered") {
          invalidDeviceIds.push(device.id);
        } else if (ticket?.status !== "ok") {
          const code = safeTicketErrorCode(ticket?.details?.error);
          retryableTicketErrors[code] = (retryableTicketErrors[code] ?? 0) + 1;
        } else if (ticket?.id) {
          // Expo has accepted this message. Delivery receipts are asynchronous
          // and may not exist immediately, so checking them here can turn an
          // already-accepted send into a retry and duplicate the notification.
        } else {
          missingTicketId = true;
        }
      });
      if (missingTicketId) throw new ExpoPushSendError("invalid_response");
      if (Object.keys(retryableTicketErrors).length > 0) {
        throw new ExpoPushSendError("ticket_error", {
          ticketErrors: Object.fromEntries(
            Object.entries(retryableTicketErrors).sort(([left], [right]) =>
              left.localeCompare(right),
            ),
          ),
        });
      }
      attempted += batch.length;
    } catch (error) {
      if (error instanceof ExpoPushSendError) throw error;
      throw new ExpoPushSendError("request_error");
    }
  }

  return { attempted, invalidDeviceIds };
}

function safeTicketErrorCode(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)
    ? value
    : "UnknownTicketError";
}
