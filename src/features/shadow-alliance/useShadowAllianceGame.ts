"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import {
  addShadowAlliancePlayer,
  createShadowAllianceGame,
  endShadowAllianceGame,
  moveShadowAllianceToPostround,
  nextShadowAllianceRound,
  rebalanceShadowAllianceTeams,
  removeShadowAlliancePlayer,
  revealShadowAllianceRound,
  resetShadowAllianceGame,
  setShadowAllianceSettings,
  setShadowAllianceTimerRunning,
  shadowAllianceRankings,
  startShadowAllianceGame,
  submitShadowAllianceNumber,
  tickShadowAllianceTimer,
  toShadowAllianceSnapshot,
} from "./engine";
import type {
  ShadowAllianceConnectionStatus,
  ShadowAllianceGame,
  ShadowAlliancePlayer,
  ShadowAllianceSnapshot,
} from "./types";

type Viewer = "teacher" | "student";

type JoinPayload = { requestId: string; playerId: string | null };
type SubmitPayload = { playerId: string; number: number };
type AssignedPayload = { requestId: string; player: ShadowAlliancePlayer };

const emptySnapshot: ShadowAllianceSnapshot = {
  phase: "lobby",
  totalRounds: 5,
  round: 0,
  command: null,
  editable: true,
  timeLeft: 0,
  timerRunning: false,
  players: [],
  lastResult: null,
};

function gameStorageKey(boardId: string) {
  return `shadow-alliance:host:${boardId}`;
}

function playerStorageKey(boardId: string) {
  return `shadow-alliance:player:${boardId}`;
}

function restoreGame(boardId: string): ShadowAllianceGame {
  try {
    const raw = window.localStorage.getItem(gameStorageKey(boardId));
    if (!raw) return createShadowAllianceGame();
    const saved = JSON.parse(raw) as ShadowAllianceGame;
    return { ...saved, timerRunning: false };
  } catch {
    return createShadowAllianceGame();
  }
}

export function useShadowAllianceGame({
  boardId,
  viewer,
}: {
  boardId: string;
  viewer: Viewer;
}) {
  const [game, setGame] = useState<ShadowAllianceGame>(() =>
    typeof window === "undefined" || viewer !== "teacher"
      ? createShadowAllianceGame()
      : restoreGame(boardId),
  );
  const [snapshot, setSnapshot] = useState<ShadowAllianceSnapshot>(emptySnapshot);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [connection, setConnection] = useState<ShadowAllianceConnectionStatus>(
    "connecting",
  );
  const [joinPending, setJoinPending] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const gameRef = useRef(game);
  const myPlayerIdRef = useRef<string | null>(null);
  const joinPendingRef = useRef(false);
  const activeJoinRequestRef = useRef<string | null>(null);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
  }, [myPlayerId]);

  const send = useCallback((event: string, payload: unknown) => {
    void channelRef.current?.send({ type: "broadcast", event, payload });
  }, []);

  const publishSnapshot = useCallback(
    (nextGame: ShadowAllianceGame) => {
      send("snapshot", { snapshot: toShadowAllianceSnapshot(nextGame) });
    },
    [send],
  );

  const updateGame = useCallback(
    (updater: (current: ShadowAllianceGame) => ShadowAllianceGame) => {
      if (viewer !== "teacher") return;
      setGame((current) => {
        const next = updater(current);
        if (next !== current) {
          gameRef.current = next;
          if (viewer === "teacher") {
            try {
              window.localStorage.setItem(gameStorageKey(boardId), JSON.stringify(next));
            } catch {}
          }
          publishSnapshot(next);
        }
        return next;
      });
    },
    [publishSnapshot, viewer],
  );

  const requestJoin = useCallback(() => {
    if (viewer !== "student" || joinPendingRef.current) return;
    const requestId = crypto.randomUUID();
    activeJoinRequestRef.current = requestId;
    joinPendingRef.current = true;
    setJoinPending(true);
    send("join", { requestId, playerId: myPlayerIdRef.current } satisfies JoinPayload);
  }, [send, viewer]);

  useEffect(() => {
    if (viewer !== "student") return;
    try {
      setMyPlayerId(window.localStorage.getItem(playerStorageKey(boardId)));
    } catch {
      setMyPlayerId(null);
    }
  }, [boardId, viewer]);

  useEffect(() => {
    let disposed = false;
    const client = createPublicSupabaseClient();
    const channel = client.channel(`shadow-alliance-board-${boardId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "hello" }, () => {
      if (viewer === "teacher") publishSnapshot(gameRef.current);
    });
    channel.on("broadcast", { event: "join" }, ({ payload }) => {
      if (viewer !== "teacher") return;
      const join = payload as JoinPayload;
      const existing = join.playerId
        ? gameRef.current.players.find((player) => player.id === join.playerId)
        : undefined;

      // Keep the joining student's browser identity stable while avoiding a
      // duplicate participant when a reconnect request reaches the host.
      if (!existing) {
        const created = addShadowAlliancePlayer(gameRef.current);
        gameRef.current = created.game;
        setGame(created.game);
        send("assigned", { requestId: join.requestId, player: created.player } satisfies AssignedPayload);
        publishSnapshot(created.game);
        return;
      }
      send("assigned", { requestId: join.requestId, player: existing } satisfies AssignedPayload);
      publishSnapshot(gameRef.current);
    });
    channel.on("broadcast", { event: "submit" }, ({ payload }) => {
      if (viewer !== "teacher") return;
      const submit = payload as SubmitPayload;
      updateGame((current) =>
        submitShadowAllianceNumber(current, submit.playerId, submit.number),
      );
    });
    channel.on("broadcast", { event: "snapshot" }, ({ payload }) => {
      if (viewer !== "student") return;
      const next = (payload as { snapshot?: ShadowAllianceSnapshot }).snapshot;
      if (!next) return;
      setSnapshot(next);
      const playerExists = myPlayerIdRef.current
        ? next.players.some((player) => player.id === myPlayerIdRef.current)
        : false;
      if (!playerExists) {
        joinPendingRef.current = false;
        setJoinPending(false);
        requestJoin();
      }
    });
    channel.on("broadcast", { event: "assigned" }, ({ payload }) => {
      if (viewer !== "student") return;
      const assigned = payload as AssignedPayload;
      if (!assigned.player?.id || assigned.requestId !== activeJoinRequestRef.current) return;
      myPlayerIdRef.current = assigned.player.id;
      setMyPlayerId(assigned.player.id);
      joinPendingRef.current = false;
      activeJoinRequestRef.current = null;
      setJoinPending(false);
      try {
        window.localStorage.setItem(playerStorageKey(boardId), assigned.player.id);
      } catch {}
    });

    channel.subscribe((status) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        setConnection("connected");
        if (viewer === "teacher") publishSnapshot(gameRef.current);
        else send("hello", {});
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnection("reconnecting");
      }
    });

    const catchUp = () => {
      if (viewer === "teacher") publishSnapshot(gameRef.current);
      else send("hello", {});
    };
    window.addEventListener("online", catchUp);
    const onVisibility = () => {
      if (document.visibilityState === "visible") catchUp();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.removeEventListener("online", catchUp);
      document.removeEventListener("visibilitychange", onVisibility);
      if (channelRef.current === channel) channelRef.current = null;
      void client.removeChannel(channel);
    };
  }, [boardId, publishSnapshot, requestJoin, send, updateGame, viewer]);

  useEffect(() => {
    if (viewer !== "teacher") return;
    try {
      window.localStorage.setItem(gameStorageKey(boardId), JSON.stringify(game));
    } catch {}
  }, [boardId, game, viewer]);

  useEffect(() => {
    if (viewer !== "teacher" || game.phase !== "playing" || !game.timerRunning) {
      return;
    }
    const timer = window.setInterval(() => updateGame(tickShadowAllianceTimer), 1000);
    return () => window.clearInterval(timer);
  }, [game.phase, game.timerRunning, updateGame, viewer]);

  const studentPlayer = myPlayerId
    ? snapshot.players.find((player) => player.id === myPlayerId) ?? null
    : null;

  return {
    connection,
    game,
    joinPending,
    myPlayerId,
    snapshot,
    studentPlayer,
    requestJoin,
    addPlayer: () => updateGame((current) => addShadowAlliancePlayer(current).game),
    removePlayer: (playerId: string) =>
      updateGame((current) => removeShadowAlliancePlayer(current, playerId)),
    rebalanceTeams: () => updateGame(rebalanceShadowAllianceTeams),
    setSettings: (settings: Parameters<typeof setShadowAllianceSettings>[1]) =>
      updateGame((current) => setShadowAllianceSettings(current, settings)),
    startGame: () => updateGame(startShadowAllianceGame),
    endGame: () => updateGame(endShadowAllianceGame),
    resetGame: () => updateGame(() => resetShadowAllianceGame()),
    nextRound: () => updateGame(nextShadowAllianceRound),
    revealRound: () => updateGame(revealShadowAllianceRound),
    showPostround: () => updateGame(moveShadowAllianceToPostround),
    setTimerRunning: (running: boolean) =>
      updateGame((current) => setShadowAllianceTimerRunning(current, running)),
    submitNumber: (number: number) => {
      if (!myPlayerIdRef.current) return;
      send("submit", {
        playerId: myPlayerIdRef.current,
        number,
      } satisfies SubmitPayload);
    },
    rankings: shadowAllianceRankings(game),
  };
}
