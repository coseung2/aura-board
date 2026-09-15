import { isOfficialGameKind, type OfficialGameKind } from "./contracts";

export type GamePresenceScopeKind = "classroom" | "board" | "session";

export type GamePresenceParticipant = {
  studentId: string;
  name: string;
  gameKind: OfficialGameKind;
  joinedAt: string;
};

type PresenceChannel = {
  on: (
    type: "presence",
    options: { event: "sync" },
    callback: () => void,
  ) => PresenceChannel;
  subscribe: (callback?: (status: string) => void) => PresenceChannel;
  track: (payload: GamePresenceParticipant) => Promise<unknown>;
  untrack: () => Promise<unknown>;
  presenceState: <T>() => Record<string, T[]>;
};

export type GamePresenceClient = {
  channel: (
    name: string,
    options?: { config: { presence: { key: string } } },
  ) => PresenceChannel;
  removeChannel: (channel: PresenceChannel) => Promise<unknown> | unknown;
};

export function gamePresenceChannelKey(
  scopeKind: GamePresenceScopeKind,
  scopeId: string,
): string {
  return `game:presence:${scopeKind}:${scopeId}`;
}

export function normalizeGamePresence(
  state: Record<string, GamePresenceParticipant[]>,
  gameKind?: OfficialGameKind | null,
): GamePresenceParticipant[] {
  const byGameStudent = new Map<string, GamePresenceParticipant>();
  for (const payloads of Object.values(state)) {
    if (!Array.isArray(payloads)) continue;
    for (const payload of payloads) {
      if (
        !payload ||
        typeof payload.studentId !== "string" ||
        !payload.studentId ||
        typeof payload.name !== "string" ||
        !payload.name ||
        !isOfficialGameKind(payload.gameKind) ||
        typeof payload.joinedAt !== "string" ||
        !payload.joinedAt ||
        (gameKind && payload.gameKind !== gameKind)
      ) {
        continue;
      }
      const key = `${payload.gameKind}:${payload.studentId}`;
      const current = byGameStudent.get(key);
      if (!current || payload.joinedAt < current.joinedAt) {
        byGameStudent.set(key, payload);
      }
    }
  }
  return [...byGameStudent.values()].sort(
    (left, right) =>
      left.joinedAt.localeCompare(right.joinedAt) ||
      left.name.localeCompare(right.name, "ko-KR"),
  );
}

/**
 * Ephemeral presence is display-only. It must never grant permissions, decide
 * scoring, or replace a game's durable participant/session model.
 */
export function subscribeGamePresence(
  client: GamePresenceClient,
  input: {
    scopeKind: GamePresenceScopeKind;
    scopeId: string;
    gameKind: OfficialGameKind | null;
    self: { studentId: string; name: string } | null;
    onChange: (participants: GamePresenceParticipant[] | null) => void;
  },
): () => void {
  let stopped = false;
  const joinedAt = new Date().toISOString();
  const channel = client.channel(
    gamePresenceChannelKey(input.scopeKind, input.scopeId),
    {
      config: {
        presence: {
          key: input.self && input.gameKind
            ? `${input.gameKind}:${input.self.studentId}:${joinedAt}`
            : `observer:${joinedAt}`,
        },
      },
    },
  );
  input.onChange(null);
  channel
    .on("presence", { event: "sync" }, () => {
      if (stopped) return;
      input.onChange(
        normalizeGamePresence(
          channel.presenceState<GamePresenceParticipant>(),
          input.gameKind,
        ),
      );
    })
    .subscribe((status) => {
      if (stopped) return;
      if (status === "SUBSCRIBED" && input.self && input.gameKind) {
        void channel
          .track({ ...input.self, gameKind: input.gameKind, joinedAt })
          .then((result) => {
            if (!stopped && result !== "ok") input.onChange(null);
          })
          .catch(() => {
            if (!stopped) input.onChange(null);
          });
        return;
      }
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        input.onChange(null);
      }
    });

  return () => {
    if (stopped) return;
    stopped = true;
    void channel.untrack().catch(() => undefined);
    void Promise.resolve(client.removeChannel(channel)).catch(() => undefined);
  };
}
