import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { createSongGuessRoom, fetchSongGuessRooms, fetchSongGuessRoomCatalog, type SongGuessRoomCategory } from "../../lib/song-guess";
import type { SongGuessSnapshot } from "../../lib/song-guess-contract";
import { AppButton, TextField } from "../ui";
import { songGuessBoardStyles as styles } from "./songGuessBoardStyles";

export function SongGuessRooms({ boardId, onSelect }: { boardId: string; onSelect: (id: string) => void }) {
  const [rooms, setRooms] = useState<SongGuessSnapshot[]>([]);
  const [catalog, setCatalog] = useState<SongGuessRoomCategory[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [segment, setSegment] = useState<"intro" | "highlight">("highlight");
  const [count, setCount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const reload = useCallback(async () => {
    try { setRooms(await fetchSongGuessRooms(boardId)); setLoadError(null); }
    catch { setLoadError("방 목록을 불러오지 못했어요."); }
    finally { setLoading(false); }
  }, [boardId]);
  const reloadCatalog = useCallback(() => { void fetchSongGuessRoomCatalog(boardId).then(setCatalog).catch(() => setError("곡 목록을 불러오지 못했어요.")); }, [boardId]);
  useEffect(() => { void reload(); reloadCatalog(); const timer = setInterval(() => void reload(), 5000); return () => clearInterval(timer); }, [reload, reloadCatalog]);
  const available = catalog.filter((item) => categories.includes(item.id)).reduce((sum, item) => sum + item.counts[segment], 0);
  const valid = categories.length > 0 && Number.isInteger(Number(count)) && Number(count) >= 1 && Number(count) <= Math.min(20, available);
  async function create() {
    if (busy || !valid) return;
    setBusy(true); setError(null);
    const key = JSON.stringify({ categories, segment, count });
    if (request.current?.key !== key) request.current = { key, id: `song-room-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    try { const room = await createSongGuessRoom(boardId, { requestId: request.current.id, categories, segment, count: Number(count) }); request.current = null; onSelect(room.sessionId); }
    catch { setError("방을 만들지 못했어요. 같은 설정으로 다시 시도할 수 있어요."); }
    finally { setBusy(false); }
  }
  return <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
    <Text style={styles.questionText}>음악 퀴즈 방</Text>
    {loading ? <Text>방을 불러오는 중…</Text> : rooms.length === 0 ? <Text style={styles.muted}>열린 방이 없어요.</Text> : rooms.map((room, index) => <AppButton key={room.sessionId} variant="secondary" disabled={busy} onPress={() => onSelect(room.sessionId)}>{`${room.roomMode === "student-free" ? "자유 게임" : "선생님 게임"} · ${room.phase === "lobby" ? "대기 중" : room.phase === "finished" ? "최종 결과" : "진행 중"} · ${room.participants.filter((p) => p.joined !== false).length}명 · ${room.hostDisplayName ? `${room.hostDisplayName}의 방` : `${index + 1}번 방`}`}</AppButton>)}
    <AppButton variant="secondary" onPress={() => { void reload(); reloadCatalog(); }}>새로고침</AppButton>
    <Text style={styles.questionText}>자유 게임 만들기</Text>
    <Text style={styles.muted}>카테고리</Text>
    {catalog.map((item) => <AppButton key={item.id} variant={categories.includes(item.id) ? "primary" : "secondary"} disabled={busy} onPress={() => setCategories((current) => current.includes(item.id) ? [] : [item.id])}>{`${categories.includes(item.id) ? "✓ " : ""}${item.label} (${item.counts[segment]})`}</AppButton>)}
    <View style={styles.actions}>{(["intro", "highlight"] as const).map((value) => <AppButton key={value} variant={segment === value ? "primary" : "secondary"} disabled={busy} onPress={() => setSegment(value)}>{value === "intro" ? "인트로" : "하이라이트"}</AppButton>)}</View>
    <Text style={styles.muted}>문제 수 (최대 {Math.min(20, available)}문제)</Text>
    <TextField accessibilityLabel="문제 수" value={count} onChangeText={setCount} keyboardType="number-pad" editable={!busy} />
    <AppButton disabled={busy || !valid} loading={busy} onPress={() => void create()}>방 만들기</AppButton>
    {(error || loadError) && <Text style={styles.errorText} accessibilityRole="alert">{error || loadError}</Text>}
  </ScrollView>;
}
