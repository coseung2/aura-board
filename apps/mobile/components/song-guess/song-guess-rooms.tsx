import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, ScrollView, Text, View } from "react-native";
import { createSongGuessRoom, fetchSongGuessRooms, fetchSongGuessRoomCatalog, type SongGuessRoomCategory } from "../../lib/song-guess";
import type { SongGuessSnapshot } from "../../lib/song-guess-contract";
import { ApiError } from "../../lib/api";
import { useLiveSnapshot } from "../../lib/use-live-snapshot";
import { AppButton } from "../ui";
import { songGuessRoomsStyles as styles } from "./songGuessRoomsStyles";

const MAX_COUNT = 20; // Student-room request contract, not a catalog-size assumption.
type Segment = "intro" | "highlight";
const primary = { style: styles.primaryAction, textStyle: styles.primaryActionText };
const secondary = { variant: "secondary" as const, style: styles.secondaryAction, textStyle: styles.secondaryActionText };

export function SongGuessRooms({ boardId, onSelect }: { boardId: string; onSelect: (id: string) => void }) {
  const [rooms, setRooms] = useState<SongGuessSnapshot[]>([]);
  const [catalog, setCatalog] = useState<SongGuessRoomCategory[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [segment, setSegment] = useState<Segment>("highlight");
  const [count, setCount] = useState(5);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const request = useRef<{ key: string; id: string } | null>(null);

  const reload = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const next = await fetchSongGuessRooms(boardId);
      if (current !== sequence.current) return;
      setRooms(next.filter((room) => room.phase !== "finished"));
      setLoadError(null);
    } catch (cause) {
      if (current === sequence.current) setLoadError("방 목록을 불러오지 못했어요.");
      throw cause;
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [boardId]);
  const reloadCatalog = useCallback(async () => {
    try { setCatalog(await fetchSongGuessRoomCatalog(boardId)); }
    catch { setError("카테고리를 불러오지 못했어요."); }
  }, [boardId]);

  useLiveSnapshot({ channelName: `board:${boardId}`, events: ["play_session_changed"], reload });
  useEffect(() => { void reloadCatalog(); return () => { ++sequence.current; }; }, [reloadCatalog]);
  useEffect(() => {
    const delays = rooms.flatMap((room) => room.nextTransitionAtMs == null ? [] : [Math.max(0, room.nextTransitionAtMs - room.serverTimeMs)]);
    if (!delays.length) return;
    const timer = setTimeout(() => {
      if (AppState.currentState === "active") void reload().catch(() => undefined);
    }, Math.min(...delays));
    return () => clearTimeout(timer);
  }, [rooms, reload]);

  const available = catalog.find((item) => item.id === category)?.counts[segment] ?? 0;
  const maxCount = Math.min(MAX_COUNT, available);
  const actualCount = Math.min(count, maxCount);
  const valid = category !== null && actualCount >= 1;

  async function create() {
    if (!valid || inFlight.current || !category) return;
    inFlight.current = true; setBusy(true); setError(null);
    const categories = [category];
    const key = JSON.stringify({ categories, segment, count: actualCount });
    if (request.current?.key !== key) request.current = { key, id: `song-room-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    try {
      const room = await createSongGuessRoom(boardId, { requestId: request.current.id, categories, segment, count: actualCount });
      onSelect(room.sessionId);
    } catch (cause) {
      const code = cause instanceof ApiError && cause.body && typeof cause.body === "object" ? (cause.body as { error?: string }).error : null;
      setError(code === "insufficient_song_guess_choices"
        ? "같은 카테고리에 보기 후보가 부족해요. 다른 카테고리를 선택해 주세요."
        : "방을 만들지 못했어요. 설정을 유지한 채 다시 시도할 수 있어요.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{creating ? "게임 만들기" : "노래 맞히기"}</Text>
      {creating ? <>
        <Text style={styles.sectionTitle}>카테고리</Text>
        <View style={styles.chipRow}>
          {catalog.map((item) => <AppButton key={item.id} {...secondary}
            style={[styles.chip, item.id === category && styles.chipSelected]}
            textStyle={item.id === category ? styles.chipSelectedText : styles.chipText}
            accessibilityState={{ selected: item.id === category }} disabled={busy || item.counts[segment] === 0}
            onPress={() => { setCategory(item.id); setError(null); }}>
            {item.label}
          </AppButton>)}
        </View>
        <Text style={styles.sectionTitle}>듣기 구간</Text>
        <View style={styles.chipRow}>
          {(["intro", "highlight"] as const).map((value) => <AppButton key={value} {...secondary}
            accessibilityState={{ selected: segment === value }} disabled={busy}
            style={[styles.chip, value === segment && styles.chipSelected]}
            textStyle={value === segment ? styles.chipSelectedText : styles.chipText}
            onPress={() => setSegment(value)}>{value === "intro" ? "인트로" : "하이라이트"}</AppButton>)}
        </View>
        <Text style={styles.sectionTitle}>문제 수</Text>
        <View style={styles.counterRow}>
          <AppButton {...secondary} accessibilityLabel="문제 수 줄이기" disabled={busy || actualCount <= 1}
            onPress={() => setCount(Math.max(1, actualCount - 1))}>−</AppButton>
          <Text style={styles.counterValue}>{actualCount || "—"}</Text>
          <AppButton {...secondary} accessibilityLabel="문제 수 늘리기" disabled={busy || actualCount >= maxCount}
            onPress={() => setCount(Math.min(maxCount, actualCount + 1))}>+</AppButton>
        </View>
        {category && <Text style={styles.subtitle}>{available ? `${available}곡 중 ${actualCount}문제` : "선택한 구간에 사용할 음원이 없어요."}</Text>}
        <AppButton {...primary} disabled={busy || !valid} loading={busy} onPress={() => void create()}>게임 만들기</AppButton>
        <AppButton {...secondary} disabled={busy} onPress={() => { setCreating(false); setError(null); }}>방 목록</AppButton>
      </> : <>
        <AppButton {...primary} onPress={() => { setCreating(true); setError(null); }}>게임 만들기</AppButton>
        {loading && <ActivityIndicator accessibilityLabel="방 목록 불러오는 중" />}
        {!loading && !loadError && rooms.length === 0 && <Text style={styles.subtitle}>열린 방이 없어요.</Text>}
        {rooms.map((room, index) => {
          const waiting = room.phase === "lobby";
          const returning = room.viewer.joined === true;
          const canEnter = waiting || returning;
          const title = room.hostDisplayName ? `${room.hostDisplayName}의 게임` : room.roomMode === "student-free" ? `${index + 1}번 자유 게임` : "선생님 게임";
          return <View key={room.sessionId} style={styles.roomCard}>
            <Text style={styles.roomName}>{title}</Text>
            <Text style={styles.roomMeta}>{waiting ? "대기 중" : "진행 중"} · {room.participants.filter((p) => p.joined !== false).length}명 참가</Text>
            <AppButton {...secondary} disabled={!canEnter} accessibilityLabel={`${title} ${returning && !waiting ? "돌아가기" : "입장"}`}
              onPress={() => onSelect(room.sessionId)}>{returning && !waiting ? "돌아가기" : "입장"}</AppButton>
          </View>;
        })}
      </>}
      {(error || loadError) && <Text selectable style={styles.errorText} accessibilityRole="alert">{error ?? loadError}</Text>}
      {(loadError || !catalog.length) && <AppButton {...secondary} disabled={busy} onPress={() => {
        void reload().catch(() => undefined); void reloadCatalog();
      }}>다시 시도</AppButton>}
    </ScrollView>
  );
}
