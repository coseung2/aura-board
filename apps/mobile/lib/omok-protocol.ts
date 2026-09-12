import { parseOmokSnapshot, type OmokIntent, type OmokSnapshot } from "./omok-contract";

/** Authoritative Omok realtime wire protocol v1 (see the realtime plan).
 * Frames are validated here so the state reducer and socket lifecycle never
 * inspect untrusted shapes themselves. */
export const OMOK_PROTOCOL_VERSION = 1 as const;

/** Server -> client frames. */
export type OmokReadyFrame = {
  type: "ready";
  protocolVersion: 1;
  sessionId: string;
  snapshot: OmokSnapshot;
};
/** Requester-only correlated acknowledgement of a committed command. */
export type OmokCommandCommittedFrame = {
  type: "command_committed";
  protocolVersion: 1;
  sessionId: string;
  requestId: string;
  commandType: OmokIntent["type"];
  previousVersion: number;
  version: number;
  replayed: boolean;
  snapshot: OmokSnapshot;
};
/** Actor-projected peer/catch-up snapshot. Never carries another actor's requestId. */
export type OmokSnapshotFrame = {
  type: "snapshot";
  protocolVersion: 1;
  sessionId: string;
  reason: "session_changed";
  snapshot: OmokSnapshot;
};
export type OmokCommandRejectedFrame = {
  type: "command_rejected";
  protocolVersion: 1;
  sessionId: string;
  requestId: string;
  commandType: OmokIntent["type"];
  error: string;
  retryable: boolean;
  currentVersion: number | null;
  snapshot: OmokSnapshot | null;
};
export type OmokConnectionErrorFrame = {
  type: "connection_error";
  protocolVersion: 1;
  error: string;
  retryable: boolean;
};
export type OmokSessionReplacedFrame = {
  type: "session_replaced";
  protocolVersion: 1;
  reason: "rematch";
  previousSessionId: string;
  sessionId: string;
  snapshot: OmokSnapshot;
};
export type OmokServerFrame =
  | OmokReadyFrame
  | OmokCommandCommittedFrame
  | OmokSnapshotFrame
  | OmokCommandRejectedFrame
  | OmokConnectionErrorFrame
  | OmokSessionReplacedFrame;

/** Client -> server frames. */
export type OmokAuthenticateFrame = {
  type: "authenticate";
  protocolVersion: 1;
  ticket: string;
  lastSeenVersion: number | null;
};
export type OmokCommandFrame = {
  type: "command";
  protocolVersion: 1;
  requestId: string;
  expectedVersion: number;
  commandSchemaVersion: 1;
  command: OmokIntent;
};
export type OmokClientFrame = OmokAuthenticateFrame | OmokCommandFrame;

/** Operational frame ceiling. A 225-cell snapshot with participants stays far
 * below this, so anything larger is treated as a protocol violation. */
export const OMOK_MAX_FRAME_BYTES = 16 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Terminal connection failures. `ticket_expired` must stay separable from
 * `forbidden` so a stale ticket silently re-tickets while a revoked actor stops. */
function isCommandType(value: unknown): value is OmokIntent["type"] {
  return value === "ready" || value === "place_stone" || value === "resign";
}

function parseOptionalSnapshotForSession(
  value: unknown,
  sessionId: string,
): OmokSnapshot | null | undefined {
  if (value === undefined || value === null) return null;
  const snapshot = parseOmokSnapshot(value);
  return snapshot?.sessionId === sessionId ? snapshot : undefined;
}

export function parseOmokServerFrame(raw: unknown): OmokServerFrame | null {
  const value =
    typeof raw === "string"
      ? (() => {
          if (raw.length > OMOK_MAX_FRAME_BYTES) return null;
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;
  if (!isRecord(value) || value.protocolVersion !== OMOK_PROTOCOL_VERSION) return null;

  switch (value.type) {
    case "ready": {
      const snapshot = parseOmokSnapshot(value.snapshot);
      return isNonEmptyString(value.sessionId) &&
        snapshot?.sessionId === value.sessionId
        ? {
            type: "ready",
            protocolVersion: 1,
            sessionId: value.sessionId,
            snapshot,
          }
        : null;
    }
    case "command_committed": {
      const snapshot = parseOmokSnapshot(value.snapshot);
      return isNonEmptyString(value.sessionId) &&
        isNonEmptyString(value.requestId) &&
        isCommandType(value.commandType) &&
        Number.isSafeInteger(value.previousVersion) &&
        Number.isSafeInteger(value.version) &&
        typeof value.replayed === "boolean" &&
        snapshot?.sessionId === value.sessionId &&
        snapshot.version === value.version
        ? {
            type: "command_committed",
            protocolVersion: 1,
            sessionId: value.sessionId,
            requestId: value.requestId,
            commandType: value.commandType,
            previousVersion: Number(value.previousVersion),
            version: Number(value.version),
            replayed: value.replayed,
            snapshot,
          }
        : null;
    }
    case "snapshot": {
      const snapshot = parseOmokSnapshot(value.snapshot);
      return isNonEmptyString(value.sessionId) &&
        value.reason === "session_changed" &&
        snapshot?.sessionId === value.sessionId
        ? {
            type: "snapshot",
            protocolVersion: 1,
            sessionId: value.sessionId,
            reason: "session_changed",
            snapshot,
          }
        : null;
    }
    case "command_rejected": {
      const snapshot = isNonEmptyString(value.sessionId)
        ? parseOptionalSnapshotForSession(value.snapshot, value.sessionId)
        : undefined;
      return isNonEmptyString(value.sessionId) &&
        isNonEmptyString(value.requestId) &&
        isCommandType(value.commandType) &&
        isNonEmptyString(value.error) &&
        typeof value.retryable === "boolean" &&
        snapshot !== undefined
        ? {
            type: "command_rejected",
            protocolVersion: 1,
            sessionId: value.sessionId,
            requestId: value.requestId,
            commandType: value.commandType,
            error: value.error,
            retryable: value.retryable,
            currentVersion: Number.isSafeInteger(value.currentVersion)
              ? Number(value.currentVersion)
              : null,
            snapshot,
          }
        : null;
    }
    case "connection_error":
      return isNonEmptyString(value.error) && typeof value.retryable === "boolean"
        ? {
            type: "connection_error",
            protocolVersion: 1,
            error: value.error,
            retryable: value.retryable,
          }
        : null;
    case "session_replaced": {
      const snapshot = parseOmokSnapshot(value.snapshot);
      return value.reason === "rematch" &&
        isNonEmptyString(value.previousSessionId) &&
        isNonEmptyString(value.sessionId) &&
        value.sessionId !== value.previousSessionId &&
        snapshot?.sessionId === value.sessionId &&
        snapshot.previousSessionId === value.previousSessionId
        ? {
            type: "session_replaced",
            protocolVersion: 1,
            reason: "rematch",
            previousSessionId: value.previousSessionId,
            sessionId: value.sessionId,
            snapshot,
          }
        : null;
    }
    default:
      return null;
  }
}
