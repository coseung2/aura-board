import "server-only";
import { db } from "@/lib/db";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

type ChildCardPushInput = {
  eventKey: string;
  studentId: string;
  studentName: string;
  boardId: string;
  boardTitle?: string | null;
  cardId: string;
};

type ExpoTicket = {
  status?: string;
  details?: { error?: string };
};

export async function dispatchLinkedParentCardPush(
  input: ChildCardPushInput,
): Promise<{ attempted: number; skipped: number }> {
  try {
    const links = await db.parentChildLink.findMany({
      where: {
        studentId: input.studentId,
        status: "active",
        deletedAt: null,
        parent: { parentDeletedAt: null },
      },
      select: {
        parent: {
          select: {
            id: true,
            pushDevices: {
              where: { disabledAt: null },
              select: { id: true, expoPushToken: true },
            },
          },
        },
      },
    });

    let attempted = 0;
    let skipped = 0;
    for (const { parent } of links) {
      if (parent.pushDevices.length === 0) continue;

      try {
        await db.parentPushDispatch.create({
          data: { parentId: parent.id, eventKey: input.eventKey },
        });
      } catch (error) {
        if ((error as { code?: unknown })?.code === "P2002") {
          skipped += parent.pushDevices.length;
          continue;
        }
        throw error;
      }

      for (let start = 0; start < parent.pushDevices.length; start += EXPO_BATCH_SIZE) {
        const devices = parent.pushDevices.slice(start, start + EXPO_BATCH_SIZE);
        attempted += devices.length;
        await sendExpoBatch(devices, input);
      }
    }
    return { attempted, skipped };
  } catch (error) {
    console.error("[parent-push] dispatch failed", {
      eventKey: input.eventKey,
      studentId: input.studentId,
      error,
    });
    return { attempted: 0, skipped: 0 };
  }
}

async function sendExpoBatch(
  devices: Array<{ id: string; expoPushToken: string }>,
  input: ChildCardPushInput,
): Promise<void> {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      signal: AbortSignal.timeout(5_000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        devices.map((device) => ({
          to: device.expoPushToken,
          sound: "default",
          title: `${input.studentName} 학생이 새 글을 올렸어요`,
          body: input.boardTitle
            ? `${input.boardTitle} 보드에서 확인해 보세요.`
            : "Aura Board에서 확인해 보세요.",
          data: {
            type: "child_card_created",
            studentId: input.studentId,
            boardId: input.boardId,
            cardId: input.cardId,
          },
        })),
      ),
    });
    if (!response.ok) {
      console.warn("[parent-push] Expo rejected batch", { status: response.status });
      return;
    }

    const payload = (await response.json().catch(() => null)) as
      | { data?: ExpoTicket[] }
      | null;
    const invalidDeviceIds = devices.flatMap((device, index) =>
      payload?.data?.[index]?.details?.error === "DeviceNotRegistered"
        ? [device.id]
        : [],
    );
    if (invalidDeviceIds.length > 0) {
      await db.parentPushDevice.updateMany({
        where: { id: { in: invalidDeviceIds } },
        data: { disabledAt: new Date() },
      });
    }
  } catch (error) {
    console.warn("[parent-push] Expo request failed", error);
  }
}
