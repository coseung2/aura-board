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
  details?: { error?: string };
};

export async function sendExpoPush(
  devices: ExpoPushDevice[],
  message: ExpoPushMessage,
): Promise<{ attempted: number; invalidDeviceIds: string[] }> {
  let attempted = 0;
  const invalidDeviceIds: string[] = [];

  for (let start = 0; start < devices.length; start += EXPO_BATCH_SIZE) {
    const batch = devices.slice(start, start + EXPO_BATCH_SIZE);
    attempted += batch.length;
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
        console.warn("[expo-push] Expo rejected batch", { status: response.status });
        continue;
      }
      const payload = (await response.json().catch(() => null)) as
        | { data?: ExpoTicket[] }
        | null;
      batch.forEach((device, index) => {
        if (payload?.data?.[index]?.details?.error === "DeviceNotRegistered") {
          invalidDeviceIds.push(device.id);
        }
      });
    } catch (error) {
      console.warn("[expo-push] Expo request failed", error);
    }
  }

  return { attempted, invalidDeviceIds };
}
