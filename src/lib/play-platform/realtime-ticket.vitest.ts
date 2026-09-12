import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isOmokRealtimeEnabled,
  issueOmokRealtimeTransport,
} from "./realtime-ticket";
import type { PlayActor } from "./actor";

const actor: PlayActor = {
  subject: "student:private-student-id",
  role: "participant",
  userId: null,
  studentId: "private-student-id",
  classroomId: "private-classroom-id",
};

describe("Omok realtime ticket issuer", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PLAY_ENGINE_REALTIME_ENABLED", "true");
    vi.stubEnv("PLAY_ENGINE_REALTIME_TICKET_SECRET", "r".repeat(32));
    vi.stubEnv("PLAY_ENGINE_PUBLIC_WS_URL", "ws://127.0.0.1:8081/v1/realtime");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("issues a short session-bound opaque ticket without subject or secret leakage", () => {
    const result = issueOmokRealtimeTransport(actor, "session-1", 1_000);
    expect(result).toMatchObject({
      transport: "websocket",
      protocolVersion: 1,
      websocketUrl: "ws://127.0.0.1:8081/v1/realtime",
      expiresAtMs: 31_000,
    });
    expect(result.websocketUrl).not.toContain(result.ticket);

    const [payload] = result.ticket.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<
      string,
      unknown
    >;
    expect(claims).toMatchObject({
      protocolVersion: 1,
      sessionId: "session-1",
      role: "participant",
      expiresAtMs: 31_000,
    });
    expect(claims.actorKey).toEqual(expect.any(String));
    expect(claims.nonce).toEqual(expect.any(String));
    expect(JSON.stringify(claims)).not.toContain(actor.subject);
    expect(JSON.stringify(claims)).not.toContain(actor.studentId!);
    expect(result.ticket).not.toContain("r".repeat(32));
  });

  it("rejects non-TLS public URLs and URL-carried data", () => {
    vi.stubEnv("PLAY_ENGINE_PUBLIC_WS_URL", "ws://play.example/v1/realtime");
    expect(() => issueOmokRealtimeTransport(actor, "session-1")).toThrow(
      "must use wss",
    );

    vi.stubEnv(
      "PLAY_ENGINE_PUBLIC_WS_URL",
      "wss://play.example/v1/realtime?ticket=forbidden",
    );
    expect(() => issueOmokRealtimeTransport(actor, "session-1")).toThrow(
      "must not contain credentials or query data",
    );
  });

  it("requires the independent 32-byte realtime secret", () => {
    vi.stubEnv("PLAY_ENGINE_REALTIME_TICKET_SECRET", "too-short");
    expect(() => issueOmokRealtimeTransport(actor, "session-1")).toThrow(
      "PLAY_ENGINE_REALTIME_TICKET_SECRET must be at least 32 bytes",
    );
  });

  it("defaults the realtime kill switch to disabled", () => {
    vi.stubEnv("PLAY_ENGINE_REALTIME_ENABLED", "");
    expect(isOmokRealtimeEnabled()).toBe(false);
    expect(() => issueOmokRealtimeTransport(actor, "session-1")).toThrow(
      "realtime_disabled",
    );
  });
});
