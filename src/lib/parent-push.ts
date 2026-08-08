import "server-only";
import { db } from "@/lib/db";
import { expoPushFailureDetails, sendExpoPush } from "@/lib/expo-push";

export type ChildCardPushInput = {
  eventKey: string;
  studentId: string;
  studentName: string;
  boardId: string;
  boardTitle?: string | null;
  cardId: string;
};

export type ParentNotificationPush = {
  eventKey: string;
  parentId: string;
  title: string;
  body: string;
  data: Record<string, string>;
};

export async function dispatchParentNotificationPush(
  input: ParentNotificationPush,
  options: { propagateFailure?: boolean } = {},
): Promise<{ attempted: number; skipped: number }> {
  let dispatchId: string | null = null;
  try {
    const devices = await db.parentPushDevice.findMany({
      where: { parentId: input.parentId, disabledAt: null },
      select: { id: true, expoPushToken: true },
    });
    if (devices.length === 0) return { attempted: 0, skipped: 0 };

    try {
      const dispatch = await db.parentPushDispatch.create({
        data: { parentId: input.parentId, eventKey: input.eventKey },
      });
      dispatchId = dispatch.id;
    } catch (error) {
      if ((error as { code?: unknown })?.code === "P2002") {
        return { attempted: 0, skipped: devices.length };
      }
      throw error;
    }

    const result = await sendExpoPush(devices, {
      title: input.title,
      body: input.body,
      data: input.data,
    });
    await disableInvalidParentDevices(result.invalidDeviceIds, input);
    return { attempted: result.attempted, skipped: 0 };
  } catch (error) {
    const released = dispatchId
      ? await releaseParentPushReservation(dispatchId, input)
      : false;
    console.error("[parent-push] notification dispatch failed", {
      eventKey: input.eventKey,
      parentId: input.parentId,
      reservationReleased: released,
      error: expoPushFailureDetails(error),
    });
    if (options.propagateFailure) throw error;
    return { attempted: 0, skipped: 0 };
  }
}

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

      let dispatchId: string;
      try {
        const dispatch = await db.parentPushDispatch.create({
          data: { parentId: parent.id, eventKey: input.eventKey },
        });
        dispatchId = dispatch.id;
      } catch (error) {
        if ((error as { code?: unknown })?.code === "P2002") {
          skipped += parent.pushDevices.length;
          continue;
        }
        throw error;
      }

      try {
        const result = await sendExpoPush(parent.pushDevices, {
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
        });
        attempted += result.attempted;
        await disableInvalidParentDevices(result.invalidDeviceIds, {
          eventKey: input.eventKey,
          parentId: parent.id,
        });
      } catch (error) {
        const released = await releaseParentPushReservation(dispatchId, {
          eventKey: input.eventKey,
          parentId: parent.id,
        });
        console.error("[parent-push] linked notification dispatch failed", {
          eventKey: input.eventKey,
          parentId: parent.id,
          reservationReleased: released,
          error: expoPushFailureDetails(error),
        });
      }
    }
    return { attempted, skipped };
  } catch (error) {
    console.error("[parent-push] dispatch failed", {
      eventKey: input.eventKey,
      studentId: input.studentId,
      error: safeErrorDetails(error),
    });
    return { attempted: 0, skipped: 0 };
  }
}

/** Resolve active parent devices for many student-card events in one DB read. */
export async function dispatchLinkedParentCardPushBatch(
  inputs: readonly ChildCardPushInput[],
): Promise<{ attempted: number; skipped: number }> {
  if (inputs.length === 0) return { attempted: 0, skipped: 0 };
  const studentIds = [...new Set(inputs.map((input) => input.studentId))];
  try {
    const links = await db.parentChildLink.findMany({
      where: {
        studentId: { in: studentIds },
        status: "active",
        deletedAt: null,
        parent: { parentDeletedAt: null },
      },
      select: {
        studentId: true,
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
    const parentsByStudent = new Map<
      string,
      Array<{
        id: string;
        pushDevices: Array<{ id: string; expoPushToken: string }>;
      }>
    >();
    for (const link of links) {
      const parents = parentsByStudent.get(link.studentId) ?? [];
      parents.push(link.parent);
      parentsByStudent.set(link.studentId, parents);
    }

    let attempted = 0;
    let skipped = 0;
    for (const input of inputs) {
      const parents = parentsByStudent.get(input.studentId) ?? [];
      for (const parent of parents) {
        if (parent.pushDevices.length === 0) continue;
        let dispatchId: string;
        try {
          const dispatch = await db.parentPushDispatch.create({
            data: { parentId: parent.id, eventKey: input.eventKey },
          });
          dispatchId = dispatch.id;
        } catch (error) {
          if ((error as { code?: unknown })?.code === "P2002") {
            skipped += parent.pushDevices.length;
            continue;
          }
          console.error("[parent-push] linked reservation failed", {
            eventKey: input.eventKey,
            parentId: parent.id,
            error: safeErrorDetails(error),
          });
          continue;
        }

        try {
          const result = await sendExpoPush(parent.pushDevices, {
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
          });
          attempted += result.attempted;
          await disableInvalidParentDevices(result.invalidDeviceIds, {
            eventKey: input.eventKey,
            parentId: parent.id,
          });
        } catch (error) {
          const released = await releaseParentPushReservation(dispatchId, {
            eventKey: input.eventKey,
            parentId: parent.id,
          });
          console.error("[parent-push] linked notification dispatch failed", {
            eventKey: input.eventKey,
            parentId: parent.id,
            reservationReleased: released,
            error: expoPushFailureDetails(error),
          });
        }
      }
    }
    return { attempted, skipped };
  } catch (error) {
    console.error("[parent-push] batch dispatch failed", {
      count: inputs.length,
      studentCount: studentIds.length,
      error: safeErrorDetails(error),
    });
    return { attempted: 0, skipped: 0 };
  }
}

async function releaseParentPushReservation(
  dispatchId: string,
  input: { eventKey: string; parentId: string },
): Promise<boolean> {
  try {
    await db.parentPushDispatch.delete({ where: { id: dispatchId } });
    return true;
  } catch (error) {
    console.error("[parent-push] reservation release failed", {
      eventKey: input.eventKey,
      parentId: input.parentId,
      error: safeErrorDetails(error),
    });
    return false;
  }
}

async function disableInvalidParentDevices(
  invalidDeviceIds: string[],
  input: { eventKey: string; parentId: string },
): Promise<void> {
  if (invalidDeviceIds.length === 0) return;
  try {
    await db.parentPushDevice.updateMany({
      where: { id: { in: invalidDeviceIds } },
      data: { disabledAt: new Date() },
    });
  } catch (error) {
    console.error("[parent-push] invalid-device cleanup failed", {
      eventKey: input.eventKey,
      parentId: input.parentId,
      error: safeErrorDetails(error),
    });
  }
}

function safeErrorDetails(error: unknown): { name: string; code?: string } {
  const name = error instanceof Error ? error.name : "UnknownError";
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  return { name, ...(code ? { code } : {}) };
}
