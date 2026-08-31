import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type UsageEventInput = {
  eventName: string;
  userId?: string | null;
  actorType?: string;
  source?: string;
  classroomId?: string | null;
  boardId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

/**
 * Record a product usage event without allowing telemetry failures to break a
 * user request. Callers should pass identifiers and small, non-sensitive
 * dimensions only; never include content bodies, tokens, or student PII.
 */
export async function recordUsageEvent(input: UsageEventInput): Promise<string | null> {
  const eventName = input.eventName.trim();
  if (!eventName || eventName.length > 120) return null;

  try {
    const event = await db.usageEvent.create({
      data: {
        eventName,
        userId: input.userId ?? null,
        actorType: input.actorType?.trim() || "user",
        source: input.source?.trim() || "web",
        classroomId: input.classroomId ?? null,
        boardId: input.boardId ?? null,
        metadata: input.metadata ?? undefined,
      },
      select: { id: true },
    });
    return event.id;
  } catch (error) {
    console.warn("[usage] failed to record event", error);
    return null;
  }
}

export async function recordUsageEvents(inputs: UsageEventInput[]): Promise<void> {
  if (!inputs.length) return;
  try {
    await db.usageEvent.createMany({
      data: inputs
        .map((input) => ({
          eventName: input.eventName.trim(),
          userId: input.userId ?? null,
          actorType: input.actorType?.trim() || "user",
          source: input.source?.trim() || "web",
          classroomId: input.classroomId ?? null,
          boardId: input.boardId ?? null,
          metadata: input.metadata ?? undefined,
        }))
        .filter((event) => event.eventName.length > 0 && event.eventName.length <= 120),
    });
  } catch (error) {
    console.warn("[usage] failed to record events", error);
  }
}
