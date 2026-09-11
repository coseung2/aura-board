"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPlayRequestId } from "@/lib/play-platform/contracts";
import { createSongGuessRoom, fetchSongGuessRoomCatalog, fetchSongGuessRooms, type SongGuessRoomCategory } from "@/lib/song-guess/browser-client";
import type { SongGuessSnapshot } from "@/lib/song-guess/contracts";
import styles from "./SongGuessBoard.module.css";

export function SongGuessRooms({ boardId, teacher, onSelect, onTeacherSetup }: { boardId: string; teacher: boolean; onSelect: (id: string) => void; onTeacherSetup: () => void }) {
  const [rooms, setRooms] = useState<SongGuessSnapshot[]>([]);
  const [catalog, setCatalog] = useState<SongGuessRoomCategory[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [segment, setSegment] = useState<"intro" | "highlight">("highlight");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);
  const reload = useCallback(async () => {
    try { setRooms(await fetchSongGuessRooms(boardId)); setLoadError(null); }
    catch { setLoadError("방 목록을 불러오지 못했어요. 다시 시도해 주세요."); }
    finally { setLoading(false); }
  }, [boardId]);
  useEffect(() => { void reload(); const timer = setInterval(() => void reload(), 5000); return () => clearInterval(timer); }, [reload]);
  useEffect(() => { void fetchSongGuessRoomCatalog(boardId).then(setCatalog).catch(() => setError("곡 목록을 불러오지 못했어요. 다시 시도해 주세요.")); }, [boardId]);
  const available = catalog.filter((item) => categories.includes(item.id)).reduce((sum, item) => sum + item.counts[segment], 0);
  async function create() {
    if (busy || !categories.length || count < 1 || count > Math.min(20, available)) return;
    setBusy(true); setError(null);
    const key = JSON.stringify({ categories, segment, count });
    if (request.current?.key !== key) request.current = { key, id: createPlayRequestId("song_guess_room") };
    try { const room = await createSongGuessRoom(boardId, { requestId: request.current.id, categories, segment, count }); request.current = null; onSelect(room.sessionId); }
    catch { setError("방을 만들지 못했어요. 같은 설정으로 다시 시도할 수 있어요."); }
    finally { setBusy(false); }
  }
  return <div className={styles.panel}>
    <h2>음악 퀴즈 방</h2>
    {loading ? <p role="status">방을 불러오는 중…</p> : rooms.length === 0 ? <p>열린 방이 없어요.</p> : <ul>{rooms.map((room, index) => <li key={room.sessionId}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => onSelect(room.sessionId)}>{room.roomMode === "student-free" ? "자유 게임" : "선생님 게임"} · {room.phase === "lobby" ? "대기 중" : room.phase === "finished" ? "최종 결과" : "진행 중"} · {room.participants.filter((p) => p.joined !== false).length}명 · {room.hostDisplayName ? `${room.hostDisplayName}의 방` : `${index + 1}번 방`}</button></li>)}</ul>}
    <button type="button" className={styles.secondaryButton} onClick={() => { void reload(); void fetchSongGuessRoomCatalog(boardId).then(setCatalog).catch(() => setError("곡 목록을 불러오지 못했어요.")); }}>새로고침</button>
    {!teacher && <><h3>자유 게임 만들기</h3>
    <fieldset disabled={busy}><legend>카테고리</legend>{catalog.map((item) => <label key={item.id} style={{ display: "inline-flex", alignItems: "center", minHeight: 44, marginRight: 16 }}><input type="radio" name="room-category" checked={categories.includes(item.id)} onChange={(event) => setCategories((current) => event.target.checked ? [item.id] : current.filter((id) => id !== item.id))} />{item.label} ({item.counts[segment]})</label>)}</fieldset>
    <label>재생 구간 <select value={segment} disabled={busy} onChange={(event) => setSegment(event.target.value as typeof segment)}><option value="intro">인트로</option><option value="highlight">하이라이트</option></select></label>{" "}
    <label>문제 수 <input type="number" min={1} max={Math.min(20, available)} value={count} disabled={busy} onChange={(event) => setCount(Number(event.target.value))} /></label>
    <p>선택한 구간에서 {available}곡 사용 가능 · 최대 20문제</p>
    <button type="button" className={styles.primaryButton} disabled={busy || !categories.length || count < 1 || count > Math.min(20, available)} onClick={() => void create()}>{busy ? "만드는 중…" : "방 만들기"}</button></>}
    {teacher && <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onTeacherSetup}>선생님 게임 구성</button>}
    {(error || loadError) && <p role="alert">{error || loadError}</p>}
  </div>;
}
