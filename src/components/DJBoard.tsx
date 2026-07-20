"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CardData } from "./DraggableCard";
import { DJNowPlayingHeader } from "./dj/DJNowPlayingHeader";
import { DJQueueList } from "./dj/DJQueueList";
import { DJSubmitForm } from "./dj/DJSubmitForm";
import { DJRanking } from "./dj/DJRanking";
import { DJPlayedStack } from "./dj/DJPlayedStack";
import { DJRecapModal } from "./dj/DJRecapModal";
import {
  DJ_PLAYED_DRAG_TYPE,
  deriveDJQueueState,
  mergeDJQueueSnapshot,
} from "./dj/dj-queue-state";
import { useBoardSnapshotRealtime } from "@/hooks/useBoardSnapshotRealtime";

type Props = {
  boardId: string;
  boardTitle: string;
  initialCards: CardData[];
  currentRole: "owner" | "editor" | "viewer";
  currentUserId: string | null;
  currentStudentId: string | null;
};

type DJQueueStatus = "pending" | "approved" | "rejected" | "played";

function getQueueStatusLabel(
  status: string | null | undefined,
  isNowPlaying: boolean,
) {
  if (isNowPlaying) return "지금 재생 중";
  switch (status) {
    case "pending":
      return "승인 대기";
    case "approved":
      return "재생 목록";
    case "played":
      return "재생 완료";
    case "rejected":
      return "반려";
    default:
      return "확인 중";
  }
}

function getQueueStatusHelp(
  status: string | null | undefined,
  isNowPlaying: boolean,
) {
  if (isNowPlaying)
    return "대기열에서 빠진 게 아니라 위쪽 NOW PLAYING으로 이동했어요.";
  switch (status) {
    case "pending":
      return "선생님 승인 전이라 대기 상태예요.";
    case "approved":
      return "승인되어 다음 재생 목록에 올라갔어요.";
    case "played":
      return "재생 완료 목록으로 이동했어요.";
    case "rejected":
      return "선생님이 목록에서 제외했어요.";
    default:
      return "잠시 후 상태가 다시 갱신돼요.";
  }
}

function queueStatusClass(status: string | null | undefined) {
  return status === "pending" ||
    status === "approved" ||
    status === "played" ||
    status === "rejected"
    ? status
    : "pending";
}

/**
 * DJ 보드 — 2026-04-22 핸드오프 디자인 포팅.
 *   ┌─ 헤더 (제목 + 카운트 + 재생완료 토글 + 공유) ──────────┐
 *   ├─ NOW PLAYING 카드 (전체 폭) ─────────────────────────┤
 *   ├─ [2열] 대기열 카드           | 사이드(신청폼 + 랭킹) ─┤
 *   └────────────────────────────────────────────────────┘
 *   + 재생 완료 드로어 (헤더 토글, 왼쪽 슬라이드)
 *
 * 레이아웃은 디자인 시안 DJBoardPage.jsx 를 1:1 포팅하되, 기존 SSE / API 계약은
 * 유지. DJPlayerProvider 연동도 그대로.
 */
export function DJBoard({
  boardId,
  boardTitle,
  initialCards,
  currentRole,
  currentStudentId,
}: Props) {
  const [cards, setCards] = useState<CardData[]>(initialCards);
  const [error, setError] = useState<string | null>(null);
  const [playedOpen, setPlayedOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const canControl = currentRole === "owner" || currentRole === "editor";

  // Tracks cards currently mid-flight so SSE snapshots don't stomp optimistic
  // mutations. Same pattern as ColumnsBoard.
  const pendingCardIds = useRef<Set<string>>(new Set());

  // dj-played-delete-touchdrag — 태블릿에서 HTML5 DnD 이벤트가 터치로 발화되지
  // 않아 재생완료 → 큐 복귀 드래그가 막힘. drag-drop-touch 폴리필을 클라이언트
  // 진입 시점에만 동적으로 로드.
  useEffect(() => {
    let cancelled = false;
    import("drag-drop-touch").catch((e) => {
      if (!cancelled) console.error("[dj] touch-drag polyfill load failed", e);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function trackMutation<T>(id: string, run: () => Promise<T>): Promise<T> {
    pendingCardIds.current.add(id);
    return run().finally(() => {
      pendingCardIds.current.delete(id);
    });
  }

  // Realtime: refetch /snapshot on mount and whenever the backend broadcasts
  // `queue_changed` on channel `board:{boardId}`. Replaces the old 15s poll.
  // Optimistic pending mutations are preserved: cards in pendingCardIds keep
  // their local shape and are never dropped by an in-flight server snapshot.
  const applyQueueSnapshot = useCallback((data: { [key: string]: unknown }) => {
    const snapshot = data as { cards: CardData[] };
    if (!Array.isArray(snapshot.cards)) return;
    setCards((local) =>
      mergeDJQueueSnapshot(snapshot.cards, local, pendingCardIds.current),
    );
  }, []);

  useBoardSnapshotRealtime(boardId, ["queue_changed"], applyQueueSnapshot);

  // Active queue = pending + approved (non-played). Played cards go into the
  // left drawer so they can be dragged back.
  const {
    activeQueue,
    playedCards,
    nowPlaying,
    upNext,
    pendingCount,
    approvedCount,
  } = useMemo(() => deriveDJQueueState(cards, canControl), [cards, canControl]);
  const studentRequests = useMemo(() => {
    if (!currentStudentId || canControl) return [];
    return cards
      .filter((c) => c.queueStatus && c.studentAuthorId === currentStudentId)
      .sort((a, b) => {
        const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
        const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
        if (aTime !== bTime) return bTime - aTime;
        return b.order - a.order;
      })
      .slice(0, 3);
  }, [cards, canControl, currentStudentId]);

  async function handleSubmit(youtubeUrl: string) {
    setError(null);
    const res = await fetch(`/api/boards/${boardId}/queue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtubeUrl }),
    });
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({ error: "제출 실패" })))
        .error;
      setError(typeof msg === "string" ? msg : "제출 실패");
      return false;
    }
    const { card } = (await res.json()) as { card: CardData };
    setCards((prev) =>
      prev.some((existing) => existing.id === card.id) ? prev : [...prev, card],
    );
    return true;
  }

  async function handleStatus(
    cardId: string,
    status: "approved" | "rejected" | "played",
  ) {
    const prev = cards;
    setCards((list) =>
      list.map((c) => (c.id === cardId ? { ...c, queueStatus: status } : c)),
    );
    await trackMutation(cardId, async () => {
      const res = await fetch(`/api/boards/${boardId}/queue/${cardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) setCards(prev);
    });
  }

  async function handleDelete(cardId: string) {
    if (!window.confirm("이 곡을 삭제할까요?")) return;
    const prev = cards;
    setCards((list) => list.filter((c) => c.id !== cardId));
    await trackMutation(cardId, async () => {
      const res = await fetch(`/api/boards/${boardId}/queue/${cardId}`, {
        method: "DELETE",
      });
      if (!res.ok) setCards(prev);
    });
  }

  async function handleReorder(cardId: string, newOrder: number) {
    const prev = cards;
    // 서버의 "insert-at-order" 의미론에 맞춰 optimistic 업데이트도 동일하게
    // 계산: 이동 대상 외 카드 중 order >= newOrder 인 건 +1 로 밀어냄.
    setCards((list) =>
      list.map((c) => {
        if (c.id === cardId) return { ...c, order: newOrder };
        if (c.queueStatus !== null && c.order >= newOrder) {
          return { ...c, order: c.order + 1 };
        }
        return c;
      }),
    );
    await trackMutation(cardId, async () => {
      const res = await fetch(`/api/boards/${boardId}/queue/${cardId}/move`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: newOrder }),
      });
      if (!res.ok) setCards(prev);
    });
  }

  async function handleNextTrack() {
    if (!nowPlaying) return;
    await handleStatus(nowPlaying.id, "played");
  }

  async function handleQueueDrop(cardId: string, targetOrder: number) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    if (card.queueStatus === "played") {
      const prev = cards;
      setCards((list) =>
        list.map((c) =>
          c.id === cardId
            ? { ...c, queueStatus: "approved", order: targetOrder }
            : c,
        ),
      );
      await trackMutation(cardId, async () => {
        const [statusRes, moveRes] = await Promise.all([
          fetch(`/api/boards/${boardId}/queue/${cardId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: "approved" }),
          }),
          fetch(`/api/boards/${boardId}/queue/${cardId}/move`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ order: targetOrder }),
          }),
        ]);
        if (!statusRes.ok || !moveRes.ok) setCards(prev);
      });
    } else {
      await handleReorder(cardId, targetOrder);
    }
  }

  async function handleRestorePlayed(cardId: string) {
    const maxOrder = activeQueue.reduce((m, c) => Math.max(m, c.order), 0);
    await handleQueueDrop(cardId, maxOrder + 1);
  }

  const rankingKey = cards.length + playedCards.length;
  const queueEmptyMessage = nowPlaying
    ? canControl
      ? "지금 재생 중인 곡만 있고 다음 곡은 없습니다."
      : "지금 재생 중인 곡은 위에 표시돼요. 다음 곡은 아직 없습니다."
    : canControl
      ? "신청곡이 없습니다. 학생들에게 신청을 받아보세요."
      : "아직 신청된 곡이 없어요. 오른쪽에서 신청해 보세요.";

  return (
    <>
      <DJPlayedStack
        cards={playedCards}
        canControl={canControl}
        open={playedOpen}
        onClose={() => setPlayedOpen(false)}
        onRestore={handleRestorePlayed}
        onMarkPlayed={(cardId) => void handleStatus(cardId, "played")}
        onDelete={handleDelete}
      />

      <main className="dj-board">
        <header className="dj-board-header">
          <div>
            <h1>🎧 {boardTitle}</h1>
            <p className="dj-board-subtitle">
              DJ 큐 · 대기 {pendingCount} · 승인 {approvedCount} · 재생 완료{" "}
              {playedCards.length}
            </p>
          </div>
          <div className="dj-header-actions">
            <button
              type="button"
              className="dj-header-btn"
              onClick={() => setRecapOpen(true)}
              aria-label="월말 리캡 열기"
            >
              📊 이달의 리캡
            </button>
            <button
              type="button"
              className="dj-header-btn"
              onClick={() => setPlayedOpen((v) => !v)}
              aria-pressed={playedOpen}
            >
              🕘 재생 완료 ({playedCards.length})
            </button>
          </div>
        </header>

        {nowPlaying ? (
          <DJNowPlayingHeader
            card={nowPlaying}
            boardId={boardId}
            canControl={canControl}
            onNext={handleNextTrack}
          />
        ) : (
          <section
            className="dj-nowplaying dj-nowplaying-empty-card"
            aria-label="재생 중인 곡 없음"
          >
            <div className="dj-nowplaying-label">▶ NOW PLAYING</div>
            <div className="dj-nowplaying-body">
              <div
                className="dj-thumb-lg dj-nowplaying-placeholder"
                aria-hidden="true"
              >
                ♪
              </div>
              <div className="dj-nowplaying-info">
                <div className="dj-track-title">재생 중인 곡이 없습니다</div>
                <div className="dj-track-meta">
                  승인된 신청곡이 생기면 이 자리에서 바로 재생할 수 있어요.
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="dj-layout">
          <section
            className="dj-queue-card"
            onDragOver={(event) => {
              if (
                canControl &&
                event.dataTransfer.types.includes(DJ_PLAYED_DRAG_TYPE)
              ) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => {
              if (!canControl) return;
              const cardId = event.dataTransfer.getData(DJ_PLAYED_DRAG_TYPE);
              if (!cardId) return;
              event.preventDefault();
              void handleRestorePlayed(cardId);
            }}
          >
            <h3 className="dj-queue-title">
              대기열
              <span className="dj-queue-hint">
                {canControl
                  ? "드래그해서 순서 변경 · 재생 완료에서도 복귀 가능"
                  : "선생님이 승인하면 재생 목록에 올라갑니다"}
              </span>
            </h3>
            {upNext.length === 0 ? (
              <div className="dj-empty">{queueEmptyMessage}</div>
            ) : (
              <DJQueueList
                cards={upNext}
                canControl={canControl}
                currentStudentId={currentStudentId}
                startRank={nowPlaying ? 2 : 1}
                onStatus={handleStatus}
                onDelete={handleDelete}
                onReorder={handleQueueDrop}
              />
            )}
          </section>

          <aside className="dj-side">
            <DJSubmitForm error={error} onSubmit={handleSubmit} />
            {studentRequests.length > 0 ? (
              <section className="dj-my-requests" aria-live="polite">
                <h3 className="dj-my-requests-title">내 신청 현황</h3>
                <ul className="dj-my-requests-list">
                  {studentRequests.map((card) => {
                    const status = card.queueStatus as
                      | DJQueueStatus
                      | null
                      | undefined;
                    const isNowPlaying = nowPlaying?.id === card.id;
                    return (
                      <li key={card.id} className="dj-my-request">
                        <div className="dj-my-request-main">
                          <span className="dj-my-request-title">
                            {card.title}
                          </span>
                          <span
                            className={`dj-status-pill dj-status-pill-${queueStatusClass(status)}`}
                          >
                            {getQueueStatusLabel(status, isNowPlaying)}
                          </span>
                        </div>
                        <p>{getQueueStatusHelp(status, isNowPlaying)}</p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            <DJRanking boardId={boardId} refreshKey={rankingKey} />
          </aside>
        </div>
      </main>

      {recapOpen && (
        <DJRecapModal
          boardId={boardId}
          boardTitle={boardTitle}
          onClose={() => setRecapOpen(false)}
        />
      )}
    </>
  );
}
