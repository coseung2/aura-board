import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { apiFetch } from "../../lib/api";
import type { BoardDetailResponse } from "../../lib/types";
import { borders, colors, spacing, typography } from "../../theme/tokens";
import { AppButton, EmptyState, Pill, SurfaceCard, TextField } from "../ui";

type Team = "black" | "white";
type Player = { id: string; nick: string; team: Team; power: number; submitted: boolean };
type Snapshot = {
  phase: "lobby" | "playing" | "revealing" | "postround" | "final";
  totalRounds: number;
  round: number;
  command: string | null;
  editable: boolean;
  timeLeft: number;
  players: Player[];
  lastResult: { winner: Team | "tie"; gains: Record<string, number> } | null;
};
type Assigned = { requestId: string; player: Player };

const EMPTY: Snapshot = {
  phase: "lobby",
  totalRounds: 5,
  round: 0,
  command: null,
  editable: true,
  timeLeft: 0,
  players: [],
  lastResult: null,
};

export function ShadowAllianceBoard({ data }: { data: BoardDetailResponse }) {
  const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const envKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const [realtimeConfig, setRealtimeConfig] = useState<{
    url: string;
    key: string;
  } | null>(envUrl && envKey ? { url: envUrl, key: envKey } : null);
  const url = realtimeConfig?.url;
  const key = realtimeConfig?.key;
  const storageKey = `shadow-alliance:player:${data.board.id}`;
  const channelRef = useRef<RealtimeChannel | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const requestRef = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [connection, setConnection] = useState<"connecting" | "connected" | "reconnecting" | "unavailable">(
    "connecting",
  );
  const [joinPending, setJoinPending] = useState(false);
  const [number, setNumber] = useState("50");

  useEffect(() => {
    if (envUrl && envKey) return;
    let cancelled = false;
    void apiFetch<
      | { configured: true; url: string; key: string }
      | { configured: false }
    >("/api/student/realtime-config")
      .then((result) => {
        if (cancelled) return;
        if (result.configured) {
          setRealtimeConfig({ url: result.url, key: result.key });
          setConnection("connecting");
        } else {
          setConnection("unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) setConnection("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [envKey, envUrl]);

  const send = useCallback((event: string, payload: unknown) => {
    void channelRef.current?.send({ type: "broadcast", event, payload });
  }, []);

  const requestJoin = useCallback(() => {
    if (!channelRef.current || requestRef.current) return;
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    requestRef.current = requestId;
    setJoinPending(true);
    send("join", { requestId, playerId: playerIdRef.current });
  }, [send]);

  useEffect(() => {
    let alive = true;
    void SecureStore.getItemAsync(storageKey).then((saved) => {
      if (!alive) return;
      playerIdRef.current = saved;
      setPlayerId(saved);
    });
    return () => { alive = false; };
  }, [storageKey]);

  useEffect(() => {
    if (!url || !key) return;
    let disposed = false;
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const channel = client.channel(`shadow-alliance-board-${data.board.id}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "snapshot" }, ({ payload }) => {
      const next = (payload as { snapshot?: Snapshot }).snapshot;
      if (!next) return;
      setSnapshot(next);
      const exists = playerIdRef.current
        ? next.players.some((candidate) => candidate.id === playerIdRef.current)
        : false;
      if (!exists) {
        requestRef.current = null;
        setJoinPending(false);
        requestJoin();
      }
    });
    channel.on("broadcast", { event: "assigned" }, ({ payload }) => {
      const assigned = payload as Assigned;
      if (!assigned.player?.id || assigned.requestId !== requestRef.current) return;
      playerIdRef.current = assigned.player.id;
      setPlayerId(assigned.player.id);
      requestRef.current = null;
      setJoinPending(false);
      void SecureStore.setItemAsync(storageKey, assigned.player.id);
    });
    channel.subscribe((status) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        setConnection("connected");
        send("hello", {});
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnection("reconnecting");
      }
    });
    const appListener = AppState.addEventListener("change", (state) => {
      if (state === "active") send("hello", {});
    });
    return () => {
      disposed = true;
      appListener.remove();
      if (channelRef.current === channel) channelRef.current = null;
      void client.removeChannel(channel);
    };
  }, [data.board.id, key, requestJoin, send, storageKey, url]);

  useEffect(() => {
    if (snapshot.phase === "playing") setNumber("50");
  }, [snapshot.phase, snapshot.round]);

  const player = useMemo(
    () => playerId ? snapshot.players.find((candidate) => candidate.id === playerId) ?? null : null,
    [playerId, snapshot.players],
  );

  if (connection === "unavailable") {
    return (
      <View style={styles.center}>
        <EmptyState
          title="실시간 게임 설정이 필요해요"
          description="EXPO_PUBLIC_SUPABASE_URL과 EXPO_PUBLIC_SUPABASE_ANON_KEY가 설정된 앱 빌드에서 사용할 수 있어요."
        />
      </View>
    );
  }

  if (!player) {
    return (
      <View style={styles.center}>
        <EmptyState
          title="익명 공작원으로 합류하는 중"
          description={`실시간 연결: ${connection}${joinPending ? " · 입장 요청 중" : ""}`}
          action={<AppButton variant="secondary" onPress={() => { requestRef.current = null; requestJoin(); }}>다시 연결</AppButton>}
        />
      </View>
    );
  }

  const result = snapshot.lastResult;
  const gain = result?.gains[player.id] ?? 0;
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <SurfaceCard style={styles.agentCard}>
        <View style={[styles.teamDot, player.team === "black" ? styles.black : styles.white]} />
        <View style={styles.agentText}>
          <Text style={styles.eyebrow}>익명 공작원</Text>
          <Text style={styles.title}>{player.nick}</Text>
        </View>
        <Text style={styles.power}>{player.power.toLocaleString()}점</Text>
      </SurfaceCard>

      {snapshot.phase === "lobby" ? (
        <EmptyState title="입장 완료" description="선생님이 게임을 시작하면 첫 지령이 도착합니다." />
      ) : null}

      {snapshot.phase === "playing" ? (
        <SurfaceCard style={styles.gameCard}>
          <Pill tone="accent">ROUND {snapshot.round} / {snapshot.totalRounds}</Pill>
          <Text style={styles.command} selectable>{snapshot.command ?? "지령 대기"}</Text>
          <Text style={styles.timer}>{formatTime(snapshot.timeLeft)}</Text>
          {player.submitted && !snapshot.editable ? (
            <Text style={styles.submitted}>응답을 전송했습니다.</Text>
          ) : (
            <>
              <TextField value={number} onChangeText={setNumber} keyboardType="number-pad" accessibilityLabel="제출 숫자" />
              <AppButton
                onPress={() => {
                  const value = Math.max(1, Math.min(100, Number(number) || 50));
                  send("submit", { playerId: player.id, number: value });
                }}
              >{player.submitted ? "수정 제출" : "숫자 제출"}</AppButton>
            </>
          )}
        </SurfaceCard>
      ) : null}

      {result && (snapshot.phase === "revealing" || snapshot.phase === "postround") ? (
        <EmptyState
          title={result.winner === "tie" ? "이번 라운드는 무승부" : result.winner === player.team ? "우리 연합 승리" : "상대 연합 승리"}
          description={`이번에 얻은 점수 ${gain.toLocaleString()}점`}
        />
      ) : null}

      {snapshot.phase === "final" ? (
        <EmptyState title={`수고했습니다, ${player.nick} 공작원`} description={`최종 점수 ${player.power.toLocaleString()}점`} />
      ) : null}
    </ScrollView>
  );
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  agentCard: { padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md },
  teamDot: { width: spacing.lg, height: spacing.lg, borderRadius: spacing.md },
  black: { backgroundColor: colors.text },
  white: { backgroundColor: colors.surface, borderWidth: borders.hairline, borderColor: colors.border },
  agentText: { flex: 1 },
  eyebrow: { ...typography.badge, color: colors.textMuted },
  title: { ...typography.title, color: colors.text },
  power: { ...typography.label, color: colors.text, fontVariant: ["tabular-nums"] },
  gameCard: { padding: spacing.xl, gap: spacing.lg, alignItems: "stretch" },
  command: { ...typography.display, color: colors.text, textAlign: "center" },
  timer: { ...typography.display, color: colors.accent, textAlign: "center", fontVariant: ["tabular-nums"] },
  submitted: { ...typography.body, color: colors.textMuted, textAlign: "center" },
});
