"use client";

import { CirclePlay } from "lucide-react";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { boardChannelKey, PLAY_SESSION_CHANGED_EVENT } from "@/lib/realtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPlayRequestId } from "@/lib/play-platform/contracts";
import {
  createSongGuessRoom,
  fetchSongGuessRoomCatalog,
  fetchSongGuessRooms,
  type SongGuessRoomCategory,
} from "@/lib/song-guess/browser-client";
import type { SongGuessSnapshot } from "@/lib/song-guess/contracts";
import styles from "./SongGuessBoard.module.css";
import entry from "./SongGuessRooms.module.css";

const MAX_COUNT = 20;
const MIN_COUNT = 1;
const SEGMENTS = ["intro", "highlight"] as const;

type Segment = (typeof SEGMENTS)[number];

function segmentLabel(segment: Segment): string {
  return segment === "intro" ? "인트로" : "하이라이트";
}

function statusLabel(room: SongGuessSnapshot): string {
  if (room.phase === "lobby") return "대기 중";
  if (room.phase === "finished") return "최종 결과";
  if (room.phase === "draft") return "준비 중";
  return "진행 중";
}

function entryLabel(room: SongGuessSnapshot): string {
  if (room.phase === "lobby") return "입장하기";
  if (room.phase === "finished") return "결과 보기";
  return "관전하기";
}

function roomTitle(room: SongGuessSnapshot, index: number): string {
  return room.hostDisplayName ? `${room.hostDisplayName}의 방` : `${index + 1}번 방`;
}

function joinedCount(room: SongGuessSnapshot): number {
  return room.participants.filter((participant) => participant.joined !== false).length;
}

export function SongGuessRooms({
  boardId,
  teacher,
  onSelect,
  onTeacherSetup,
}: {
  boardId: string;
  teacher: boolean;
  onSelect: (id: string) => void;
  onTeacherSetup: () => void;
}) {
  const [rooms, setRooms] = useState<SongGuessSnapshot[]>([]);
  const [catalog, setCatalog] = useState<SongGuessRoomCategory[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [segment, setSegment] = useState<Segment>("highlight");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const request = useRef<{ key: string; id: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      setRooms((await fetchSongGuessRooms(boardId)).filter((room) => room.phase !== "finished"));
      setLoadError(null);
    } catch {
      setLoadError("방 목록을 불러오지 못했어요.");
      throw new Error("song_guess_rooms_unavailable");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  const reloadCatalog = useCallback(async () => {
    try {
      setCatalog(await fetchSongGuessRoomCatalog(boardId));
    } catch {
      setError("곡 목록을 불러오지 못했어요.");
    }
  }, [boardId]);

  useRealtimeInvalidation({
    channelName: boardChannelKey(boardId),
    event: PLAY_SESSION_CHANGED_EVENT,
    refresh: reload,
    initialRefresh: false,
    fallbackPollMs: 10_000,
  });

  useEffect(() => { void reload().catch(() => undefined); }, [reload]);

  useEffect(() => {
    const delays = rooms.flatMap((room) => room.nextTransitionAtMs == null ? [] : [Math.max(0, room.nextTransitionAtMs - room.serverTimeMs)]);
    if (!delays.length) return;
    const timer = window.setTimeout(() => {
      if (!document.hidden) void reload().catch(() => undefined);
    }, Math.min(...delays));
    return () => window.clearTimeout(timer);
  }, [rooms, reload]);

  useEffect(() => {
    void reloadCatalog();
  }, [reloadCatalog]);

  const available = useMemo(
    () =>
      catalog
        .filter((item) => categories.includes(item.id))
        .reduce((sum, item) => sum + item.counts[segment], 0),
    [catalog, categories, segment],
  );
  const maxCount = Math.min(MAX_COUNT, available);
  const canCreate = categories.length > 0 && count >= MIN_COUNT && count <= maxCount;

  async function create() {
    if (busy || !canCreate) return;
    setBusy(true);
    setError(null);
    const key = JSON.stringify({ categories, segment, count });
    if (request.current?.key !== key) {
      request.current = { key, id: createPlayRequestId("song_guess_room") };
    }
    try {
      const room = await createSongGuessRoom(boardId, {
        requestId: request.current.id,
        categories,
        segment,
        count,
      });
      request.current = null;
      onSelect(room.sessionId);
    } catch {
      setError("방을 만들지 못했어요. 같은 설정으로 다시 시도할 수 있어요.");
    } finally {
      setBusy(false);
    }
  }

  function refreshAll() {
    void reload().catch(() => undefined);
    void reloadCatalog();
  }

  return (
    <div className={entry.entry}>
      <div className={entry.entryBody}>
        <section className={entry.card} aria-label="열린 방">
          <h2 className={entry.sectionTitle}>열린 방</h2>

          {loading ? (
            <p className={entry.empty} role="status">
              방을 불러오는 중…
            </p>
          ) : loadError ? (
            <div className={entry.empty} role="alert">
              <p className={entry.emptyTitle}>{loadError}</p>
              <button type="button" className={styles.secondaryButton} onClick={refreshAll}>
                다시 시도
              </button>
            </div>
          ) : rooms.length === 0 ? (
            <p className={entry.empty}>아직 열린 방이 없어요</p>
          ) : (
            <ul className={entry.roomList}>
              {rooms.map((room, index) => {
                const title = roomTitle(room, index);
                const label = entryLabel(room);
                return (
                  <li key={room.sessionId} className={entry.roomCard}>
                    <span className={entry.roomTop}>
                      <h3 className={entry.roomName}>{title}</h3>
                      <span
                        className={`${entry.chip} ${room.phase === "lobby" ? entry.chipWaiting : ""}`}
                      >
                        {statusLabel(room)}
                      </span>
                    </span>
                    <p className={entry.roomMeta}>
                      {room.roomMode === "student-free" ? "자유 게임" : "선생님 게임"} ·{" "}
                      {room.answerMode === "multiple-choice" ? "객관식" : "직접 입력"} ·{" "}
                      {joinedCount(room)}명 참여
                    </p>
                    <button
                      type="button"
                      className={entry.roomEnter}
                      disabled={busy}
                      aria-label={`${title} ${label}`}
                      onClick={() => onSelect(room.sessionId)}
                    >
                      <CirclePlay aria-hidden size={18} strokeWidth={2.3} />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {teacher ? (
          <section className={entry.card} aria-label="수업용 게임">
            <h2 className={entry.sectionTitle}>수업용 게임</h2>
            <div className={entry.teacherOptions}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={busy}
                onClick={onTeacherSetup}
              >
                자동 출제
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy}
                onClick={onTeacherSetup}
              >
                직접 음원 구성
              </button>
            </div>
          </section>
        ) : (
          <section className={entry.card} aria-label="새 게임 만들기">
            <h2 className={entry.sectionTitle}>새 게임 만들기</h2>

            <fieldset className={entry.fieldset} disabled={busy}>
              <legend className={entry.legend}>장르</legend>
              <div className={entry.optionRow}>
                {catalog.map((item) => (
                  <label key={item.id} className={entry.option}>
                    <input
                      type="radio"
                      className={entry.optionInput}
                      name="room-category"
                      checked={categories.includes(item.id)}
                      onChange={(event) =>
                        setCategories((current) =>
                          event.target.checked
                            ? [item.id]
                            : current.filter((id) => id !== item.id),
                        )
                      }
                    />
                    {item.label} ({item.counts[segment]})
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className={entry.fieldset} disabled={busy}>
              <legend className={entry.legend}>재생 구간</legend>
              <div className={entry.optionRow}>
                {SEGMENTS.map((value) => (
                  <label key={value} className={entry.option}>
                    <input
                      type="radio"
                      className={entry.optionInput}
                      name="room-segment"
                      checked={segment === value}
                      onChange={() => setSegment(value)}
                    />
                    {segmentLabel(value)}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className={entry.fieldset} disabled={busy}>
              <legend className={entry.legend}>문제 수</legend>
              <div className={entry.counter}>
                <button
                  type="button"
                  className={entry.counterButton}
                  aria-label="문제 수 줄이기"
                  disabled={busy || count <= MIN_COUNT}
                  onClick={() => setCount((current) => Math.max(MIN_COUNT, current - 1))}
                >
                  −
                </button>
                <span className={entry.counterValue}>
                  <span className={entry.counterNumber}>{count}</span>
                  <span className={entry.counterUnit}>문제</span>
                </span>
                <button
                  type="button"
                  className={entry.counterButton}
                  aria-label="문제 수 늘리기"
                  disabled={busy || count >= maxCount}
                  onClick={() => setCount((current) => Math.min(maxCount, current + 1))}
                >
                  ＋
                </button>
              </div>
            </fieldset>

            <button
              type="button"
              className={styles.primaryButton}
              disabled={busy || !canCreate}
              onClick={() => void create()}
            >
              {busy ? "만드는 중…" : "게임 만들기"}
            </button>
          </section>
        )}
      </div>

      {error && (
        <p className={entry.alert} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
