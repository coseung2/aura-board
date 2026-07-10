import { describe, expect, it } from "vitest";
import {
  buildColumnsPresencePayload,
  summarizeColumnsPresence,
  type ColumnsPresencePayload,
} from "@/lib/columns-presence";

function presence(
  overrides: Partial<ColumnsPresencePayload> &
    Pick<ColumnsPresencePayload, "actorKey" | "sessionId">,
): ColumnsPresencePayload {
  return {
    version: 1,
    actorKey: overrides.actorKey,
    sessionId: overrides.sessionId,
    role: overrides.role ?? "viewer",
    mode: overrides.mode ?? "browsing",
    sectionId: overrides.sectionId ?? null,
    cardId: overrides.cardId ?? null,
    visible: overrides.visible ?? true,
    onlineAt: overrides.onlineAt ?? "2026-07-10T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-10T00:00:01.000Z",
  };
}

describe("columns presence", () => {
  it("builds a payload without exposing an application user id", () => {
    const payload = buildColumnsPresencePayload({
      actorKey: "actor-a",
      sessionId: "session-a",
      role: "editor",
      activity: { mode: "editing", sectionId: "section-a", cardId: "card-a" },
      visible: true,
      onlineAt: "2026-07-10T00:00:00.000Z",
      now: "2026-07-10T00:00:02.000Z",
    });

    expect(payload).toEqual({
      version: 1,
      actorKey: "actor-a",
      sessionId: "session-a",
      role: "editor",
      mode: "editing",
      sectionId: "section-a",
      cardId: "card-a",
      visible: true,
      onlineAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:02.000Z",
    });
    expect(payload).not.toHaveProperty("userId");
    expect(payload).not.toHaveProperty("name");
  });

  it("deduplicates multiple tabs from the same actor", () => {
    const summary = summarizeColumnsPresence(
      {
        one: [presence({ actorKey: "actor-a", sessionId: "tab-1" })],
        two: [presence({ actorKey: "actor-a", sessionId: "tab-2" })],
        three: [presence({ actorKey: "actor-b", sessionId: "tab-3" })],
      },
      "actor-a",
    );

    expect(summary.onlineCount).toBe(2);
    expect(summary.otherOnlineCount).toBe(1);
  });

  it("aggregates remote working modes and active sections", () => {
    const summary = summarizeColumnsPresence(
      {
        a: [
          presence({
            actorKey: "actor-self",
            sessionId: "self",
            mode: "editing",
            sectionId: "section-a",
          }),
        ],
        b: [
          presence({
            actorKey: "actor-b",
            sessionId: "b",
            mode: "editing",
            sectionId: "section-a",
          }),
        ],
        c: [
          presence({
            actorKey: "actor-c",
            sessionId: "c",
            mode: "adding",
            sectionId: "section-b",
          }),
        ],
        d: [
          presence({
            actorKey: "actor-d",
            sessionId: "d",
            mode: "dragging",
            sectionId: "section-b",
          }),
        ],
      },
      "actor-self",
    );

    expect(summary).toMatchObject({
      onlineCount: 4,
      otherOnlineCount: 3,
      remoteWorkingCount: 3,
      remoteEditingCount: 1,
      remoteAddingCount: 1,
      remoteDraggingCount: 1,
      remoteActiveSectionCount: 2,
    });
  });

  it("ignores hidden and malformed public-channel rows", () => {
    const summary = summarizeColumnsPresence(
      {
        hidden: [
          presence({
            actorKey: "actor-hidden",
            sessionId: "hidden",
            visible: false,
          }),
        ],
        malformed: [
          { actorKey: "actor-malformed", sessionId: "bad", visible: true },
          "not-an-object",
        ],
        valid: [presence({ actorKey: "actor-valid", sessionId: "valid" })],
      },
      "actor-self",
    );

    expect(summary.onlineCount).toBe(1);
    expect(summary.otherOnlineCount).toBe(1);
  });
});
