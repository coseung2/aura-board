export type ColumnsPresenceMode =
  | "browsing"
  | "viewing"
  | "editing"
  | "adding"
  | "dragging";

export type ColumnsPresenceActivity = {
  mode: ColumnsPresenceMode;
  /** Local-only context. These identifiers are never copied into Presence. */
  sectionId?: string | null;
  cardId?: string | null;
};

export type ColumnsPresencePayload = {
  version: 1;
  actorKey: string;
  sessionId: string;
  mode: ColumnsPresenceMode;
  visible: boolean;
  updatedAt: string;
};

export type ColumnsPresenceSummary = {
  onlineCount: number;
  otherOnlineCount: number;
  remoteWorkingCount: number;
};

export type ColumnsRealtimeStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "unavailable";

export const EMPTY_COLUMNS_PRESENCE_SUMMARY: ColumnsPresenceSummary = {
  onlineCount: 0,
  otherOnlineCount: 0,
  remoteWorkingCount: 0,
};

const PRESENCE_MODES = new Set<ColumnsPresenceMode>([
  "browsing",
  "viewing",
  "editing",
  "adding",
  "dragging",
]);

export function buildColumnsPresencePayload(input: {
  actorKey: string;
  sessionId: string;
  activity: ColumnsPresenceActivity;
  visible: boolean;
  now?: string;
}): ColumnsPresencePayload {
  return {
    version: 1,
    actorKey: input.actorKey,
    sessionId: input.sessionId,
    mode: input.activity.mode,
    visible: input.visible,
    updatedAt: input.now ?? new Date().toISOString(),
  };
}

/**
 * The board channel is public, so Presence is untrusted and intentionally
 * contains no application identity, role, name, email, section id, or card id.
 */
export function summarizeColumnsPresence(
  state: Record<string, unknown>,
  ownActorKey: string,
): ColumnsPresenceSummary {
  const onlineActors = new Set<string>();
  const remoteActors = new Set<string>();
  const remoteWorkingActors = new Set<string>();

  for (const value of Object.values(state)) {
    if (!Array.isArray(value)) continue;

    for (const candidate of value) {
      const presence = parseColumnsPresencePayload(candidate);
      if (!presence || !presence.visible) continue;

      onlineActors.add(presence.actorKey);
      if (presence.actorKey === ownActorKey) continue;

      remoteActors.add(presence.actorKey);
      if (isWorkingMode(presence.mode)) {
        remoteWorkingActors.add(presence.actorKey);
      }
    }
  }

  return {
    onlineCount: onlineActors.size,
    otherOnlineCount: remoteActors.size,
    remoteWorkingCount: remoteWorkingActors.size,
  };
}

function parseColumnsPresencePayload(
  value: unknown,
): ColumnsPresencePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  if (row.version !== 1) return null;
  if (!isShortString(row.actorKey) || !isShortString(row.sessionId)) return null;
  if (!PRESENCE_MODES.has(row.mode as ColumnsPresenceMode)) return null;
  if (typeof row.visible !== "boolean" || !isShortString(row.updatedAt)) {
    return null;
  }

  return {
    version: 1,
    actorKey: row.actorKey,
    sessionId: row.sessionId,
    mode: row.mode as ColumnsPresenceMode,
    visible: row.visible,
    updatedAt: row.updatedAt,
  };
}

function isWorkingMode(mode: ColumnsPresenceMode): boolean {
  return mode === "editing" || mode === "adding" || mode === "dragging";
}

function isShortString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}
