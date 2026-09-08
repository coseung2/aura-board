"use client";
import { useCallback, useEffect, useState } from "react";
import type { SongGuessImportItem } from "@/lib/song-guess/import-contract";
import type { SongGuessTeacherClip } from "@/lib/song-guess/contracts";
import styles from "./SongGuessBoard.module.css";

export type ImportedSongDraft = { title: string; artist: string; clip: SongGuessTeacherClip };
type Props = { boardId: string; disabled: boolean; onAdd: (song: ImportedSongDraft) => void; onBusyChange?: (busy: boolean) => void };
const messages: Record<string, string> = {
  invalid_song_guess_import_link: "시작 시간이 포함된 유튜브 링크를 넣어 주세요. 예: https://youtu.be/영상ID?t=45",
  song_guess_import_limit: "진행 중인 작업이 끝난 뒤 추가해 주세요. 반별로 최대 100곡을 보관할 수 있어요.",
  song_guess_import_metadata_required: "가수·작곡가와 제목을 확인해 주세요.",
  song_guess_import_processing: "음원을 가져오는 중이에요. 완료 후 다시 시도해 주세요.",
  forbidden: "이 반의 음악을 관리할 권한이 없어요.",
};

async function call(boardId: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/song-guess/boards/${encodeURIComponent(boardId)}/imports`, {
    method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(messages[result.error] ?? "음악 링크를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
  return result;
}

export function SongGuessImportPanel({ boardId, disabled, onAdd, onBusyChange }: Props) {
  const [items, setItems] = useState<SongGuessImportItem[]>([]);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const result = await call(boardId);
    setItems(result.items);
  }, [boardId]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const result = await call(boardId); if (active) { setItems(result.items); setError(null); } }
      catch (cause) { if (active) setError((cause as Error).message); }
    };
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [boardId]);
  async function action(operation: () => Promise<void>) {
    setBusy(true); onBusyChange?.(true); setError(null); setNotice(null);
    try { await operation(); await refresh(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  return <section className={styles.panel} aria-label="우리 반 음악 링크">
    <h2>우리 반 음악 링크</h2>
    <p>유튜브의 ‘현재 시간에 동영상 URL 복사’로 가져온 링크를 넣어 주세요. 그 시점부터 15초를 준비해요.</p>
    <form onSubmit={event => { event.preventDefault(); void action(async () => {
      await call(boardId, "POST", { action: "import", link }); setLink(""); setNotice("등록했어요. 준비되면 아래 목록에서 문제에 추가할 수 있어요.");
    }); }}>
      <label className={styles.field}><span>시작 시간이 포함된 유튜브 링크</span>
        <input type="url" value={link} onChange={event => setLink(event.target.value)} required maxLength={2000} placeholder="https://youtu.be/영상ID?t=45" disabled={disabled || busy} />
      </label>
      <button className={styles.primaryButton} disabled={disabled || busy || !link.trim()}>링크 등록</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {items.length === 0 && <p>등록한 음악은 이 반에서 다시 사용할 수 있어요.</p>}
    {items.map(item => <ImportRow key={item.id} item={item} disabled={disabled || busy}
      onSave={(title, artist) => action(async () => { await call(boardId, "PATCH", { id: item.id, title, artist }); setNotice("곡 정보를 저장했어요."); })}
      onAdd={(title, artist) => action(async () => {
        await call(boardId, "PATCH", { id: item.id, title, artist });
        const song = await call(boardId, "POST", { action: "materialize", id: item.id });
        onAdd(song); setNotice("편집 목록에 추가했어요. ‘라운드 팩 저장’으로 출제 구성을 저장해 주세요.");
      })}
      onRetry={() => action(async () => { await call(boardId, "POST", { action: "import", link: item.sourceUrl }); })}
      onDelete={() => action(async () => { await call(boardId, "DELETE", { id: item.id }); })} />)}
  </section>;
}

function ImportRow({ item, disabled, onSave, onAdd, onRetry, onDelete }: {
  item: SongGuessImportItem; disabled: boolean; onSave: (title: string, artist: string) => Promise<void>;
  onAdd: (title: string, artist: string) => Promise<void>; onRetry: () => Promise<void>; onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(item.title);
  const [artist, setArtist] = useState(item.artist);
  useEffect(() => { setTitle(item.title); setArtist(item.artist); }, [item.title, item.artist]);
  return <article className={styles.sidebarCard}>
    <a className={styles.sourceLink} href={item.sourceUrl} target="_blank" rel="noopener noreferrer">원본 · {item.startSeconds}초부터</a>
    {item.status === "ready" ? <>
      <label className={styles.field}><span>가수 · 클래식 작곡가</span><input aria-label="등록곡 가수 또는 작곡가" value={artist} onChange={event => setArtist(event.target.value)} maxLength={200} disabled={disabled} /></label>
      <label className={styles.field}><span>노래 제목</span><input aria-label="등록곡 노래 제목" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} disabled={disabled} /></label>
      <div className={styles.inlineActions}>
        <button type="button" className={styles.secondaryButton} disabled={disabled || !title.trim() || !artist.trim()} onClick={() => void onSave(title, artist)}>곡 정보 저장</button>
        <button type="button" className={styles.primaryButton} disabled={disabled || !title.trim() || !artist.trim()} onClick={() => void onAdd(title, artist)}>문제에 추가</button>
      </div>
    </> : <p className={styles.importStatus} role="status">{item.status === "failed" ? item.error : item.status === "processing" ? "15초 음원을 준비하고 있어요…" : "차례를 기다리고 있어요…"}</p>}
    <div className={styles.inlineActions}>
      {item.status === "failed" && <button type="button" className={styles.secondaryButton} disabled={disabled} onClick={() => void onRetry()}>다시 시도</button>}
      <button type="button" className={styles.dangerQuietButton} disabled={disabled || item.status === "processing"} onClick={() => void onDelete()}>목록에서 삭제</button>
    </div>
  </article>;
}
