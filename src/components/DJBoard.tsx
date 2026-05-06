"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CardData } from "./DraggableCard";
import { DJNowPlayingHeader } from "./dj/DJNowPlayingHeader";
import { DJQueueList } from "./dj/DJQueueList";
import { DJSubmitForm } from "./dj/DJSubmitForm";
import { DJRanking } from "./dj/DJRanking";
import { DJPlayedStack } from "./dj/DJPlayedStack";
import { DJRecapModal } from "./dj/DJRecapModal";

type Props = {
  boardId: string;
  boardTitle: string;
  initialCards: CardData[];
  currentRole: "owner" | "editor" | "viewer";
  currentUserId: string | null;
  currentStudentId: string | null;
};

const DJ_POLL_MS = 15_000;

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

  // Poll short snapshots instead of holding a long-lived SSE function open.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastHash = "";

    async function poll() {
      if (stopped) return;
      try {
        const qs = lastHash ? `?hash=${encodeURIComponent(lastHash)}` : "";
        const res = await fetch(`/api/boards/${boardId}/snapshot${qs}`, {
          cache: "no-store",
        });
        if (res.status === 401 || res.status === 403) {
          stopped = true;
          return;
        }
        if (res.status !== 304 && res.ok) {
          const data = (await res.json()) as {
            cards: CardData[];
            hash?: string;
          };
          lastHash = data.hash ?? "";
          setCards((local) => {
            const localById = new Map(local.map((c) => [c.id, c] as const));
            const next: CardData[] = [];
            for (const sc of data.cards) {
              if (pendingCardIds.current.has(sc.id)) {
                const l = localById.get(sc.id);
                next.push(l ?? sc);
              } else {
                next.push(sc);
              }
            }
            for (const l of local) {
              if (
                pendingCardIds.current.has(l.id) &&
                !data.cards.some((sc) => sc.id === l.id)
              ) {
                next.push(l);
              }
            }
            return next;
          });
        }
      } catch (e) {
        console.error("[dj snapshot poll]", e);
      }
      if (!stopped) timer = setTimeout(poll, DJ_POLL_MS);
    }

    poll();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // Active queue = pending + approved (non-played). Played cards go into the
  // left drawer so they can be dragged back.
  const activeQueue = useMemo(() => {
    const visible = cards.filter(
      (c) =>
        c.queueStatus &&
        c.queueStatus !== "played" &&
        (canControl || c.queueStatus !== "rejected"),
    );
    return [...visible].sort((a, b) => a.order - b.order);
  }, [cards, canControl]);

  const playedCards = useMemo(() => {
    return cards
      .filter((c) => c.queueStatus === "played")
      .sort((a, b) => b.order - a.order);
  }, [cards]);

  const nowPlaying = useMemo(() => {
    return activeQueue.find((c) => c.queueStatus === "approved") ?? null;
  }, [activeQueue]);

  const upNext = activeQueue.filter((c) => c.id !== nowPlaying?.id);

  const pendingCount = activeQueue.filter((c) => c.queueStatus === "pending").length;
  const approvedCount = activeQueue.filter((c) => c.queueStatus === "approved").length;

  async function handleSubmit(youtubeUrl: string) {
    setError(null);
    const res = await fetch(`/api/boards/${boardId}/queue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ youtubeUrl }),
    });
    if (!res.ok) {
      const msg = (await res.json().catch(() => ({ error: "제출 실패" }))).error;
      setError(typeof msg === "string" ? msg : "제출 실패");
      return;
    }
    const { card } = (await res.json()) as { card: CardData };
    setCards((prev) => [...prev, card]);
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
      const res = await fetch(
        `/api/boards/${boardId}/queue/${cardId}/move`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ order: newOrder }),
        },
      );
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

  const isEmpty = activeQueue.length === 0;
  const rankingKey = cards.length + playedCards.length;

  return (
    <>
      <DJPlayedStack
        cards={playedCards}
        canControl={canControl}
        open={playedOpen}
        onClose={() => setPlayedOpen(false)}
        onRestore={handleRestorePlayed}
        onDelete={handleDelete}
      />

      <main className="dj-board">
        <header className="dj-board-header">
          <div>
            <h1>🎧 {boardTitle}</h1>
            <p className="dj-board-subtitle">
              DJ 큐 · 대기 {pendingCount} · 승인 {approvedCount} · 재생 완료 {playedCards.length}
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

        {nowPlaying && (
          <DJNowPlayingHeader
            card={nowPlaying}
            boardId={boardId}
            canControl={canControl}
            onNext={handleNextTrack}
          />
        )}

        <div className="dj-layout">
          <section className="dj-queue-card">
            <h3 className="dj-queue-title">
              대기열
              <span className="dj-queue-hint">
                {canControl ? "드래그해서 순서 변경 · 재생 완료에서도 복귀 가능" : "선생님이 승인하면 재생 목록에 올라갑니다"}
              </span>
            </h3>
            {isEmpty ? (
              <div className="dj-empty">
                {canControl
                  ? "신청곡이 없습니다. 학생들에게 신청을 받아보세요."
                  : "아직 신청된 곡이 없어요. 오른쪽에서 신청해 보세요."}
              </div>
            ) : (
              <DJQueueList
                cards={upNext}
                canControl={canControl}
                currentStudentId={currentStudentId}
                onStatus={handleStatus}
                onDelete={handleDelete}
                onReorder={handleQueueDrop}
              />
            )}
          </section>

          <aside className="dj-side">
            <DJSubmitForm error={error} onSubmit={handleSubmit} />
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
