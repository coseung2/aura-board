import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { ensureMobileRealtimeClient } from "./use-board-realtime";

export type KordleLobbyPresenceParticipant = {
  studentId: string;
  name: string;
  joinedAt: string;
};

type PresenceChannel = {
  on: (
    type: "presence",
    options: { event: "sync" },
    callback: () => void,
  ) => PresenceChannel;
  subscribe: (callback?: (status: string) => void) => PresenceChannel;
  track: (payload: KordleLobbyPresenceParticipant) => Promise<unknown>;
  untrack: () => Promise<unknown>;
  presenceState: <T>() => Record<string, T[]>;
};

type PresenceClient = {
  channel: (
    name: string,
    options?: { config: { presence: { key: string } } },
  ) => PresenceChannel;
  removeChannel: (channel: PresenceChannel) => Promise<unknown> | unknown;
};

export function normalizeKordleLobbyPresence(
  state: Record<string, KordleLobbyPresenceParticipant[]>,
): KordleLobbyPresenceParticipant[] {
  const byStudent = new Map<string, KordleLobbyPresenceParticipant>();
  for (const payloads of Object.values(state)) {
    if (!Array.isArray(payloads)) continue;
    for (const payload of payloads) {
      if (
        !payload ||
        typeof payload.studentId !== "string" ||
        !payload.studentId ||
        typeof payload.name !== "string" ||
        !payload.name ||
        typeof payload.joinedAt !== "string" ||
        !payload.joinedAt
      ) {
        continue;
      }
      const current = byStudent.get(payload.studentId);
      if (!current || payload.joinedAt < current.joinedAt) {
        byStudent.set(payload.studentId, payload);
      }
    }
  }
  return [...byStudent.values()].sort(
    (left, right) =>
      left.joinedAt.localeCompare(right.joinedAt) ||
      left.name.localeCompare(right.name, "ko-KR"),
  );
}

export function useKordleLobbyPresence(
  boardId: string,
  student: { id: string; name: string },
  enabled: boolean,
) {
  const [participants, setParticipants] = useState<
    KordleLobbyPresenceParticipant[] | null
  >(null);

  useEffect(() => {
    if (!enabled) {
      setParticipants(null);
      return;
    }

    let disposed = false;
    let generation = 0;
    let unsubscribe: (() => void) | undefined;

    async function connect() {
      const version = ++generation;
      unsubscribe?.();
      unsubscribe = undefined;
      setParticipants(null);
      if (AppState.currentState !== "active") return;

      try {
        const baseClient = await ensureMobileRealtimeClient();
        if (disposed || version !== generation || !baseClient) return;
        const client = baseClient as unknown as PresenceClient;
        const joinedAt = new Date().toISOString();
        let stopped = false;
        const channel = client.channel(`kordle:lobby:${boardId}`, {
          config: { presence: { key: `${student.id}:${joinedAt}` } },
        });

        channel
          .on("presence", { event: "sync" }, () => {
            if (stopped || disposed || version !== generation) return;
            setParticipants(
              normalizeKordleLobbyPresence(
                channel.presenceState<KordleLobbyPresenceParticipant>(),
              ),
            );
          })
          .subscribe((status) => {
            if (stopped || disposed || version !== generation) return;
            if (status === "SUBSCRIBED") {
              void channel
                .track({ studentId: student.id, name: student.name, joinedAt })
                .catch(() => {
                  if (!stopped && !disposed && version === generation) {
                    setParticipants(null);
                  }
                });
              return;
            }
            if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              setParticipants(null);
            }
          });

        unsubscribe = () => {
          if (stopped) return;
          stopped = true;
          void channel.untrack().catch(() => undefined);
          void Promise.resolve(client.removeChannel(channel)).catch(() => undefined);
        };
      } catch {
        if (!disposed && version === generation) setParticipants(null);
      }
    }

    void connect();
    const listener = AppState.addEventListener("change", () => {
      void connect();
    });

    return () => {
      disposed = true;
      ++generation;
      unsubscribe?.();
      listener.remove();
    };
  }, [boardId, student.id, student.name, enabled]);

  return participants;
}
