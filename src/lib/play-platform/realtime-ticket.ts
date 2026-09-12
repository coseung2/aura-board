import "server-only";

import { createHmac, randomBytes } from "crypto";
import type { PlayActor } from "./actor";
import {
  OMOK_REALTIME_PROTOCOL_VERSION,
  type OmokRealtimeTransport,
} from "./contracts";

const TICKET_TTL_MS = 30_000;
const TICKET_SIGNATURE_DOMAIN = "aura-play-realtime-ticket-v1";
const ACTOR_KEY_DOMAIN = "aura-play-realtime-actor-v1";

export function isOmokRealtimeEnabled(): boolean {
  return process.env.PLAY_ENGINE_REALTIME_ENABLED?.trim().toLowerCase() === "true";
}

type RealtimeTicketClaims = {
  protocolVersion: typeof OMOK_REALTIME_PROTOCOL_VERSION;
  sessionId: string;
  role: PlayActor["role"];
  actorKey: string;
  expiresAtMs: number;
  nonce: string;
};

function realtimeSecret(): Buffer {
  const value = process.env.PLAY_ENGINE_REALTIME_TICKET_SECRET;
  if (!value || Buffer.byteLength(value) < 32) {
    throw new Error(
      "PLAY_ENGINE_REALTIME_TICKET_SECRET must be at least 32 bytes",
    );
  }
  return Buffer.from(value);
}

function updatePart(hmac: ReturnType<typeof createHmac>, value: string | Buffer) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.length);
  hmac.update(length);
  hmac.update(bytes);
}

function domainHmac(secret: Buffer, domain: string, parts: readonly string[]) {
  const hmac = createHmac("sha256", secret);
  updatePart(hmac, domain);
  for (const part of parts) updatePart(hmac, part);
  return hmac;
}

function publicWebsocketUrl(): string {
  const configured = process.env.PLAY_ENGINE_PUBLIC_WS_URL?.trim();
  if (!configured) throw new Error("PLAY_ENGINE_PUBLIC_WS_URL is required");
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("PLAY_ENGINE_PUBLIC_WS_URL is invalid");
  }
  const isLoopback =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "[::1]";
  if (url.protocol !== "wss:" && !(process.env.NODE_ENV !== "production" && url.protocol === "ws:" && isLoopback)) {
    throw new Error("PLAY_ENGINE_PUBLIC_WS_URL must use wss");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("PLAY_ENGINE_PUBLIC_WS_URL must not contain credentials or query data");
  }
  return url.toString();
}

export function issueOmokRealtimeTransport(
  actor: PlayActor,
  sessionId: string,
  nowMs = Date.now(),
): Extract<OmokRealtimeTransport, { transport: "websocket" }> {
  if (!isOmokRealtimeEnabled()) throw new Error("realtime_disabled");
  if (!sessionId || sessionId.length > 255) throw new Error("invalid_session_id");
  const secret = realtimeSecret();
  const expiresAtMs = nowMs + TICKET_TTL_MS;
  const nonce = randomBytes(18).toString("base64url");
  const actorKey = domainHmac(secret, ACTOR_KEY_DOMAIN, [
    sessionId,
    actor.role,
    actor.subject,
    String(expiresAtMs),
    nonce,
  ])
    .digest()
    .toString("base64url");
  const claims: RealtimeTicketClaims = {
    protocolVersion: OMOK_REALTIME_PROTOCOL_VERSION,
    sessionId,
    role: actor.role,
    actorKey,
    expiresAtMs,
    nonce,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = domainHmac(secret, TICKET_SIGNATURE_DOMAIN, [payload])
    .digest()
    .toString("base64url");
  return {
    transport: "websocket",
    protocolVersion: OMOK_REALTIME_PROTOCOL_VERSION,
    websocketUrl: publicWebsocketUrl(),
    ticket: `${payload}.${signature}`,
    expiresAtMs,
  };
}
