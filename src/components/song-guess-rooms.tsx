"use client";

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
      setRooms(await fetchSongGuessRooms(boardId));
      setLoadError(null);
    } catch {
      setLoadError("방 목록을 불러오지 못했어요. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), 5000);
    return () => clearInterval(timer);
  }, [reload]);

  useEffect(() => {
    void fetchSongGuessRoomCatalog(boardId)
      .then(setCatalog)
      .catch(() => setError("곡 목록을 불러오지 못했어요. 다시 시도해 주세요."));
  }, [boardId]);

  const available = useMemo(
    () =>
      catalog
        .filter((item) => categories.includes(item.id))
        .reduce((sum, item) => sum + item.counts[segment], 0),
    [catalog, categories, segment],
  );
  const maxCount = Math.min(MAX_COUNT, available);
  const canCreate = categories.length > 0 && count >= MIN_COUNT && count <= maxCount;
  const selectedLabels = catalog
    .filter((item) => categories.includes(item.id))
    .map((item) => item.label)
    .join(" + ");

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
    void reload();
    void fetchSongGuessRoomCatalog(boardId)
      .then(setCatalog)
      .catch(() => setError("곡 목록을 불러오지 못했어요."));
  }

  return (
    <div className={entry.entry}>
      <div className={entry.entryHeader}>
        <span className={entry.eyebrow}>{teacher ? "TEACHER" : "AURA BOARD"}</span>
        <h2 className={entry.entryTitle}>음악 퀴즈 방</h2>
        <p className={entry.entrySubtitle}>
          {teacher
            ? "수업용 게임을 구성하거나 열린 방을 확인할 수 있어요."
            : "열린 방에 들어가거나 새 게임을 만들 수 있어요."}
        </p>
      </div>

      <div className={entry.entryBody}>
        <section className={entry.card} aria-label="열린 방">
          <div className={entry.sectionRow}>
            <h3 className={entry.sectionTitle}>열린 방</h3>
            <button type="button" className={styles.secondaryButton} onClick={refreshAll}>
              새로고침
            </button>
          </div>

          {loading ? (
            <p className={entry.loading} role="status">
              방을 불러오는 중…
            </p>
          ) : loadError ? (
            <div className={entry.empty} role="alert">
              <span className={entry.emptyIcon} aria-hidden="true">
                !
              </span>
              <p className={entry.emptyTitle}>방 목록을 불러오지 못했어요</p>
              <p className={entry.emptyBody}>
                네트워크를 확인한 뒤 다시 시도해 주세요. 잠시 후 자동으로 다시 확인해요.
              </p>
              <button type="button" className={styles.secondaryButton} onClick={refreshAll}>
                다시 시도
              </button>
            </div>
          ) : rooms.length === 0 ? (
            <div className={entry.empty}>
              <span className={entry.emptyIcon} aria-hidden="true">
                ♫
              </span>
              <p className={entry.emptyTitle}>아직 열린 방이 없어요</p>
              <p className={entry.emptyBody}>
                친구가 방을 열 때까지 기다리거나 내가 먼저 게임을 만들어 보세요.
              </p>
              <span className={entry.chip}>5초마다 자동 확인</span>
            </div>
          ) : (
            <ul className={entry.roomList}>
              {rooms.map((room, index) => {
                const status = statusLabel(room);
                const mode = room.roomMode === "student-free" ? "자유 게임" : "선생님 게임";
                const host = room.hostDisplayName
                  ? `${room.hostDisplayName}의 방`
                  : `${index + 1}번 방`;
                return (
                  <li key={room.sessionId}>
                    <button
                      type="button"
                      className={entry.roomCard}
                      disabled={busy}
                      aria-label={`${mode} · ${status} · ${joinedCount(room)}명 · ${host}`}
                      onClick={() => onSelect(room.sessionId)}
                    >
                      <span className={entry.roomTop}>
                        <span>
                          <span className={entry.roomName}>{host}</span>
                          <br />
                          <span className={entry.roomMeta}>
                            {mode} ·{" "}
                            {room.answerMode === "multiple-choice" ? "객관식" : "직접 입력"}
                          </span>
                        </span>
                        <span
                          className={`${entry.chip} ${room.phase === "lobby" ? entry.chipWaiting : ""}`}
                        >
                          {status}
                        </span>
                      </span>
                      <span className={entry.roomDivider} />
                      <span className={entry.roomFoot}>
                        <span className={entry.roomCount}>{joinedCount(room)}명 참여</span>
                        <span className={entry.roomEnter}>
                          {room.phase === "lobby" ? "입장하기  ›" : "이어서 보기  ›"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {teacher ? (
          <section className={entry.card} aria-label="수업용 게임 구성">
            <h3 className={entry.createHeading}>수업용 게임</h3>
            <p className={entry.createNote}>
              출제 방식을 고르면 학생 입장 준비까지 이어집니다.
            </p>
            <div className={entry.teacherOptions}>
              <div className={entry.teacherCard}>
                <span className={entry.chip}>권장</span>
                <h4 className={entry.teacherCardTitle}>자동 출제</h4>
                <p className={entry.teacherCardBody}>
                  저장된 곡에서 문제를 자동으로 뽑아 바로 게임을 만들어요.
                </p>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy}
                  onClick={onTeacherSetup}
                >
                  선생님 게임 구성
                </button>
              </div>
              <div className={entry.teacherCard}>
                <span className={entry.chip}>직접 구성</span>
                <h4 className={entry.teacherCardTitle}>직접 음원 구성</h4>
                <p className={entry.teacherCardBody}>
                  내 컴퓨터의 음원으로 라운드를 직접 만들고 저장해요.
                </p>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={busy}
                  onClick={onTeacherSetup}
                >
                  음원 편집 열기
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className={entry.card} aria-label="자유 게임 만들기">
            <h3 className={entry.createHeading}>자유 게임 만들기</h3>
            <p className={entry.createNote}>
              장르와 재생 구간, 문제 수를 정하면 방이 만들어져요.
            </p>

            <fieldset className={entry.fieldset} disabled={busy}>
              <legend className={entry.legend}>카테고리</legend>
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

            <div className={entry.fieldset}>
              <span className={entry.legend}>문제 수</span>
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
              <label className={entry.createNote}>
                문제 수 직접 입력
                <input
                  type="number"
                  min={MIN_COUNT}
                  max={maxCount}
                  value={count}
                  disabled={busy}
                  onChange={(event) => setCount(Number(event.target.value))}
                />
              </label>
            </div>

            <div className={entry.summary}>
              <span className={entry.summaryRow}>
                <span className={entry.summaryKey}>선택한 게임</span>
                <span className={entry.summaryValue}>
                  {selectedLabels || "장르 미선택"} · {segmentLabel(segment)} · {count}문제
                </span>
              </span>
              <span className={entry.summaryRow}>
                <span className={entry.summaryKey}>사용 가능한 곡</span>
                <span className={entry.summaryValue}>{available}곡 · 최대 {MAX_COUNT}문제</span>
              </span>
            </div>

            <button
              type="button"
              className={styles.primaryButton}
              disabled={busy || !canCreate}
              onClick={() => void create()}
            >
              {busy ? "만드는 중…" : "방 만들기"}
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
