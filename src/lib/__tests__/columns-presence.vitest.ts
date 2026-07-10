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
    mode: overrides.mode ?? "browsing",
    visible: overrides.visible ?? true,
    updatedAt: overrides.updatedAt ?? "2026-07-10T00:00:01.000Z",
  };
}

describe("columns presence", () => {
  it("builds a minimal payload without application identity or board ids", () => {
    const payload = buildColumnsPresencePayload({
      actorKey: "actor-a",
      sessionId: "session-a",
      activity: { mode: "editing" },
      visible: true,
      now: "2026-07-10T00:00:02.000Z",
    });

    expect(payload).toEqual({
      version: 1,
      actorKey: "actor-a",
      sessionId: "session-a",
      mode: "editing",
      visible: true,
      updatedAt: "2026-07-10T00:00:02.000Z",
    });
    expect(payload).not.toHaveProperty("userId");
    expect(payload).not.toHaveProperty("studentId");
    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("sectionId");
    expect(payload).not.toHaveProperty("cardId");
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

    expect(summary).toEqual({
      onlineCount: 2,
      otherOnlineCount: 1,
      remoteWorkingCount: 0,
    });
  });

  it("aggregates editing, adding, and dragging as remote work", () => {
    const summary = summarizeColumnsPresence(
      {
        self: [
          presence({
            actorKey: "actor-self",
            sessionId: "self",
            mode: "editing",
          }),
        ],
        edit: [
          presence({ actorKey: "actor-b", sessionId: "b", mode: "editing" }),
        ],
        add: [
          presence({ actorKey: "actor-c", sessionId: "c", mode: "adding" }),
        ],
        drag: [
          presence({ actorKey: "actor-d", sessionId: "d", mode: "dragging" }),
        ],
        view: [
          presence({ actorKey: "actor-e", sessionId: "e", mode: "viewing" }),
        ],
      },
      "actor-self",
    );

    expect(summary).toEqual({
      onlineCount: 5,
      otherOnlineCount: 4,
      remoteWorkingCount: 3,
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

    expect(summary).toEqual({
      onlineCount: 1,
      otherOnlineCount: 1,
      remoteWorkingCount: 0,
    });
  });
});
