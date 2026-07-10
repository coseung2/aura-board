export type ColumnsPresenceMode =
  | "browsing"
  | "viewing"
  | "editing"
  | "adding"
  | "dragging";

export type ColumnsPresenceRole = "owner" | "editor" | "viewer";

export type ColumnsPresenceActivity = {
  mode: ColumnsPresenceMode;
  sectionId?: string | null;
  cardId?: string | null;
};

export type ColumnsPresencePayload = {
  version: 1;
  actorKey: string;
  sessionId: string;
  role: ColumnsPresenceRole;
  mode: ColumnsPresenceMode;
  sectionId: string | null;
  cardId: string | null;
  visible: boolean;
  onlineAt: string;
  updatedAt: string;
};

export type ColumnsPresenceSummary = {
  onlineCount: number;
  otherOnlineCount: number;
  remoteWorkingCount: number;
  remoteEditingCount: number;
  remoteAddingCount: number;
  remoteDraggingCount: number;
  remoteActiveSectionCount: number;
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
  remoteEditingCount: 0,
  remoteAddingCount: 0,
  remoteDraggingCount: 0,
  remoteActiveSectionCount: 0,
};

const PRESENCE_MODES = new Set<ColumnsPresenceMode>([
  "browsing",
  "viewing",
  "editing",
  "adding",
  "dragging",
]);

const PRESENCE_ROLES = new Set<ColumnsPresenceRole>([
  "owner",
  "editor",
  "viewer",
]);

export function buildColumnsPresencePayload(input: {
  actorKey: string;
  sessionId: string;
  role: ColumnsPresenceRole;
  activity: ColumnsPresenceActivity;
  visible: boolean;
  onlineAt: string;
  now?: string;
}): ColumnsPresencePayload {
  return {
    version: 1,
    actorKey: input.actorKey,
    sessionId: input.sessionId,
    role: input.role,
    mode: input.activity.mode,
    sectionId: input.activity.sectionId ?? null,
    cardId: input.activity.cardId ?? null,
    visible: input.visible,
    onlineAt: input.onlineAt,
    updatedAt: input.now ?? new Date().toISOString(),
  };
}

/**
 * Presence channels are public for the current board transport, so every row is
 * treated as untrusted. The payload deliberately contains no name, email, user
 * id, or student id; only random client keys and coarse activity are accepted.
 */
export function summarizeColumnsPresence(
  state: Record<string, unknown>,
  ownActorKey: string,
): ColumnsPresenceSummary {
  const onlineActors = new Set<string>();
  const remoteActors = new Set<string>();
  const remoteWorkingActors = new Set<string>();
  const remoteEditingActors = new Set<string>();
  const remoteAddingActors = new Set<string>();
  const remoteDraggingActors = new Set<string>();
  const remoteActiveSections = new Set<string>();

  for (const value of Object.values(state)) {
    if (!Array.isArray(value)) continue;

    for (const candidate of value) {
      const presence = parseColumnsPresencePayload(candidate);
      if (!presence || !presence.visible) continue;

      onlineActors.add(presence.actorKey);
      if (presence.actorKey === ownActorKey) continue;

      remoteActors.add(presence.actorKey);
      if (presence.sectionId) remoteActiveSections.add(presence.sectionId);

      if (
        presence.mode === "editing" ||
        presence.mode === "adding" ||
        presence.mode === "dragging"
      ) {
        remoteWorkingActors.add(presence.actorKey);
      }
      if (presence.mode === "editing") {
        remoteEditingActors.add(presence.actorKey);
      }
      if (presence.mode === "adding") {
        remoteAddingActors.add(presence.actorKey);
      }
      if (presence.mode === "dragging") {
        remoteDraggingActors.add(presence.actorKey);
      }
    }
  }

  return {
    onlineCount: onlineActors.size,
    otherOnlineCount: remoteActors.size,
    remoteWorkingCount: remoteWorkingActors.size,
    remoteEditingCount: remoteEditingActors.size,
    remoteAddingCount: remoteAddingActors.size,
    remoteDraggingCount: remoteDraggingActors.size,
    remoteActiveSectionCount: remoteActiveSections.size,
  };
}

function parseColumnsPresencePayload(
  value: unknown,
): ColumnsPresencePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  if (row.version !== 1) return null;
  if (!isShortString(row.actorKey) || !isShortString(row.sessionId)) return null;
  if (!PRESENCE_ROLES.has(row.role as ColumnsPresenceRole)) return null;
  if (!PRESENCE_MODES.has(row.mode as ColumnsPresenceMode)) return null;
  if (typeof row.visible !== "boolean") return null;
  if (!isShortString(row.onlineAt) || !isShortString(row.updatedAt)) return null;
  if (!isNullableShortString(row.sectionId)) return null;
  if (!isNullableShortString(row.cardId)) return null;

  return {
    version: 1,
    actorKey: row.actorKey,
    sessionId: row.sessionId,
    role: row.role as ColumnsPresenceRole,
    mode: row.mode as ColumnsPresenceMode,
    sectionId: row.sectionId,
    cardId: row.cardId,
    visible: row.visible,
    onlineAt: row.onlineAt,
    updatedAt: row.updatedAt,
  };
}

function isShortString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function isNullableShortString(value: unknown): value is string | null {
  return value === null || isShortString(value);
}
