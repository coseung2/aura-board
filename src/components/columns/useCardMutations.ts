"use client";

import { useRef, useState, type MutableRefObject } from "react";
import { flushSync } from "react-dom";
import type { CardData } from "../DraggableCard";
import type { AddCardData } from "../AddCardModal";
import type { EditCardUpdates } from "../EditCardModal";

type UseCardMutationsOptions = {
  boardId: string;
  canEdit: boolean;
  sections: { id: string; order: number; pinned: boolean }[];
  cardsRef: { current: CardData[] };
  setCards: React.Dispatch<React.SetStateAction<CardData[]>>;
};

type UseCardMutationsReturn = {
  pendingCardIds: MutableRefObject<Set<string>>;
  handleAdd: (data: AddCardData) => Promise<void>;
  handleDeleteCard: (id: string) => Promise<void>;
  handleEditCardSave: (
    editingCard: CardData | null,
    updates: EditCardUpdates
  ) => Promise<void>;
  handleDuplicateCard: (card: CardData) => Promise<void>;
  moveCard: (cardId: string, targetSectionId: string) => Promise<void>;
  handleCardReorder: (
    cardId: string,
    targetCardId: string,
    sectionId: string,
    dropPosition: "before" | "after",
    visibleCardIds?: string[]
  ) => Promise<void>;
  handleDragStart: (e: React.DragEvent, cardId: string) => void;
  handleDragEnd: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (
    e: React.DragEvent,
    targetSectionId: string,
    setSections: React.Dispatch<React.SetStateAction<any[]>>,
    setDraggingSectionId: React.Dispatch<React.SetStateAction<string | null>>,
    setOverSectionId: React.Dispatch<React.SetStateAction<string | null>>
  ) => void;
};

function getColumnCardRects() {
  if (typeof document === "undefined") return new Map<string, DOMRect>();

  const rects = new Map<string, DOMRect>();
  document
    .querySelectorAll<HTMLElement>("[data-column-card-id]")
    .forEach((el) => {
      const id = el.dataset.columnCardId;
      if (id) rects.set(id, el.getBoundingClientRect());
    });
  return rects;
}

function animateColumnCardLayout(update: () => void) {
  if (typeof document === "undefined") {
    update();
    return;
  }

  const before = getColumnCardRects();
  flushSync(update);

  requestAnimationFrame(() => {
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduceMotion) return;

    document
      .querySelectorAll<HTMLElement>("[data-column-card-id]")
      .forEach((el) => {
        const id = el.dataset.columnCardId;
        const first = id ? before.get(id) : null;
        if (!first) return;

        const last = el.getBoundingClientRect();
        const dx = first.left - last.left;
        const dy = first.top - last.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0, 0)" },
          ],
          {
            duration: 220,
            easing: "cubic-bezier(0.2, 0, 0, 1)",
          }
        );
      });
  });
}

/**
 * Shared helper: optimistic fetch with local rollback on failure.
 * Wraps the common `fetch → optimistic update → rollback on failure` pattern.
 */
export async function optimisticMutate<T>(
  fetchFn: () => Promise<Response>,
  rollback: () => void,
  /**
   * After a successful fetch, `onSuccess` can apply server-confirmed state
   * (e.g. replace optimistic card with the server's copy).
   */
  onSuccess?: () => void
): Promise<void> {
  try {
    const res = await fetchFn();
    if (!res.ok) {
      rollback();
      return;
    }
    onSuccess?.();
  } catch {
    rollback();
  }
}

export function useCardMutations({
  boardId,
  canEdit,
  sections,
  cardsRef,
  setCards,
}: UseCardMutationsOptions): UseCardMutationsReturn {
  const pendingCardIds = useRef<Set<string>>(new Set());


  function trackCardMutation<T>(ids: string | string[], run: () => Promise<T>): Promise<T> {
    const idList = Array.isArray(ids) ? ids : [ids];
    for (const id of idList) pendingCardIds.current.add(id);
    return run().finally(() => {
      for (const id of idList) pendingCardIds.current.delete(id);
    });
  }

  function getCardsForSection(
    sectionId: string,
    cards: CardData[]
  ): CardData[] {
    return cards.filter((c) => (c.sectionId ?? "") === sectionId);
  }

  /* ── Add card ── */
  async function handleAdd(data: AddCardData) {
    const targetSection = data.sectionId ?? sections[0]?.id ?? null;
    const order = targetSection
      ? cardsRef.current.filter((c) => (c.sectionId ?? "") === targetSection)
          .length
      : 0;
    try {
      const res = await fetch(`/api/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          boardId,
          title: data.title,
          content: data.content,
          linkUrl: data.linkUrl || null,
          linkTitle: data.linkTitle || null,
          linkDesc: data.linkDesc || null,
          linkImage: data.linkImage || null,
          attachments: data.attachments,
          color: data.color || null,
          x: 0,
          y: 0,
          order,
          sectionId: targetSection,
        }),
      });
      if (res.ok) {
        const { card } = await res.json();
        setCards((prev) => [...prev, card]);
      } else {
        alert(`카드 추가 실패: ${await res.text()}`);
      }
    } catch (err) {
      console.error(err);
    }
  }

  /* ── Delete card ── */
  async function handleDeleteCard(id: string) {
    if (!window.confirm("이 카드를 삭제할까요?")) return;
    const prevCards: CardData[] = [];
    animateColumnCardLayout(() => setCards((list) => {
      prevCards.push(...list);
      return list.filter((c) => c.id !== id);
    }));
    await trackCardMutation(id, () =>
      optimisticMutate(
        () => fetch(`/api/cards/${id}`, { method: "DELETE" }),
        () => setCards(prevCards)
      )
    );
  }

  /* ── Edit card ── */
  async function handleEditCardSave(
    editingCard: CardData | null,
    updates: EditCardUpdates
  ) {
    if (!editingCard) return;
    const prevCards: CardData[] = [];
    const cardId = editingCard.id;
    const { attachments: updateAttachments, ...restUpdates } = updates;
    const optimisticUpdates: Partial<CardData> = { ...restUpdates };
    if (updateAttachments) {
      optimisticUpdates.attachments = updateAttachments.map((a, idx) => ({
        id: a.tempId,
        kind: a.kind,
        url: a.url,
        previewUrl: a.previewUrl ?? null,
        fileName: a.fileName ?? null,
        fileSize: a.fileSize ?? null,
        mimeType: a.mimeType ?? null,
        order: idx,
      }));
    }
    setCards((list) => {
      prevCards.push(...list);
      return list.map((c) =>
        c.id === cardId ? { ...c, ...optimisticUpdates } : c
      );
    });
    await trackCardMutation(cardId, () =>
      optimisticMutate(
        () =>
          fetch(`/api/cards/${cardId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(updates),
          }),
        () => setCards(prevCards),
        async () => {
          const res = await fetch(`/api/cards/${cardId}`).catch(() => null);
          if (res?.ok) {
            const data = await res.json();
            if (data.card) {
              setCards((list) =>
                list.map((c) => (c.id === cardId ? data.card : c))
              );
            }
          }
        }
      )
    );
  }

  /* ── Duplicate card ── */
  async function handleDuplicateCard(card: CardData) {
    try {
      const res = await fetch(`/api/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          boardId,
          title: `${card.title} (복사)`,
          content: card.content,
          imageUrl: card.imageUrl || null,
          linkUrl: card.linkUrl || null,
          videoUrl: card.videoUrl || null,
          color: card.color || null,
          x: 0,
          y: 0,
          order: 0,
          sectionId: card.sectionId,
        }),
      });
      if (res.ok) {
        const { card: newCard } = await res.json();
        setCards((prev) => [...prev, newCard]);
      }
    } catch (err) {
      console.error(err);
    }
  }

  /* ── Intra-section card reorder / cross-section card move ── */
  async function handleCardReorder(
    cardId: string,
    targetCardId: string,
    sectionId: string,
    dropPosition: "before" | "after",
    visibleCardIds?: string[]
  ) {
    let prevCards: CardData[] = [];
    let toSave: Array<{ id: string; order: number; sectionId?: string }> = [];

    animateColumnCardLayout(() => setCards((list) => {
      prevCards = [...list];

      const draggedCard = list.find((c) => c.id === cardId);
      if (!draggedCard) return list;

      const isCrossSection = (draggedCard.sectionId ?? "") !== sectionId;

      const sectionCards = list
        .filter((c) => (c.sectionId ?? "") === sectionId)
        .sort((a, b) => {
          if (!visibleCardIds) return a.order - b.order;
          return visibleCardIds.indexOf(a.id) - visibleCardIds.indexOf(b.id);
        });

      const targetIdx = sectionCards.findIndex((c) => c.id === targetCardId);
      if (targetIdx === -1) return list;

      if (isCrossSection) {
        // Cross-section: insert dragged card at the right position within
        // the target section, updating its sectionId and all affected orders.
        // Also reindex the source section so remaining orders have no gaps.
        let insertAt = targetIdx;
        if (dropPosition === "after") insertAt++;
        if (insertAt > sectionCards.length) insertAt = sectionCards.length;

        const movedCard = { ...draggedCard, sectionId, order: 0 };
        const reordered = [...sectionCards];
        reordered.splice(insertAt, 0, movedCard);

        const targetUpdates = reordered.map((c, i) => ({
          id: c.id,
          order: i,
          sectionId: c.id === cardId ? sectionId : undefined,
        }));

        // Reindex source section — remaining cards keep sequential order
        const sourceSectionId = draggedCard.sectionId ?? "";
        const sourceCards = list
          .filter((c) => (c.sectionId ?? "") === sourceSectionId && c.id !== cardId)
          .sort((a, b) => a.order - b.order);

        const sourceUpdates = sourceCards.map((c, i) => ({
          id: c.id,
          order: i,
          sectionId: undefined,
        }));

        toSave = [...targetUpdates, ...sourceUpdates];

        const updateMap = new Map(toSave.map((s) => [s.id, s]));
        return list.map((c) => {
          const saved = updateMap.get(c.id);
          if (saved) {
            return {
              ...c,
              sectionId: saved.sectionId ?? c.sectionId,
              order: saved.order,
            };
          }
          return c;
        });
      }

      // Intra-section: reorder within the same section
      const sourceIdx = sectionCards.findIndex((c) => c.id === cardId);
      if (sourceIdx === -1) return list;

      const reordered = sectionCards.filter((c) => c.id !== cardId);

      let insertAt = reordered.findIndex((c) => c.id === targetCardId);
      if (dropPosition === "after") insertAt++;
      if (insertAt > reordered.length) insertAt = reordered.length;

      const movedCard = list.find((c) => c.id === cardId)!;
      reordered.splice(insertAt, 0, movedCard);

      toSave = reordered.map((c, i) => ({ id: c.id, order: i }));

      const orderMap = new Map(reordered.map((c, i) => [c.id, i] as const));
      return list.map((c) => {
        const o = orderMap.get(c.id);
        return o !== undefined ? { ...c, order: o } : c;
      });
    }));

    if (toSave.length === 0) return;

    const affectedIds = toSave.map((s) => s.id);
    await trackCardMutation(affectedIds, () =>
      optimisticMutate(
        () =>
          Promise.all(
            toSave.map(({ id, order, sectionId: newSectionId }) =>
              fetch(`/api/cards/${id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(
                  newSectionId !== undefined
                    ? { sectionId: newSectionId, order }
                    : { order }
                ),
              })
            )
          ).then((results) => {
            const ok = results.every((r) => r.ok);
            return ok ? Response.json({ ok: true }) : Promise.reject();
          }),
        async () => {
          setCards(prevCards);
          // 부분실패 시 서버에 부분 반영된 상태와 클라이언트를 맞추기 위해
          // 보드 스냅샷 재조회 → 서버 상태로 수렴
          try {
            const res = await fetch(`/api/boards/${boardId}/snapshot`);
            if (res.ok) {
              const data = await res.json();
              if (data.cards) setCards(data.cards);
            }
          } catch {}
        }
      )
    );
  }

  /* ── Card drag/drop ── */
  async function moveCard(cardId: string, targetSectionId: string) {
    let newOrder = 0;
    const prevCards: CardData[] = [];
    setCards((list) => {
      prevCards.push(...list);
      const targetCards = list.filter(
        (c) => (c.sectionId ?? "") === targetSectionId
      );
      newOrder = targetCards.length;
      return list.map((c) =>
        c.id === cardId
          ? { ...c, sectionId: targetSectionId, order: newOrder }
          : c
      );
    });

    await trackCardMutation(cardId, () =>
      optimisticMutate(
        () =>
          fetch(`/api/cards/${cardId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sectionId: targetSectionId, order: newOrder }),
          }),
        () => setCards(prevCards)
      )
    );
  }

  function handleDragStart(e: React.DragEvent, cardId: string) {
    e.dataTransfer.setData("application/card-id", cardId);
    e.dataTransfer.effectAllowed = "move";
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.add("is-dragging");
    }
  }

  function handleDragEnd(e: React.DragEvent) {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.remove("is-dragging");
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(
    e: React.DragEvent,
    targetSectionId: string,
    setSections: React.Dispatch<React.SetStateAction<any[]>>,
    setDraggingSectionId: React.Dispatch<
      React.SetStateAction<string | null>
    >,
    setOverSectionId: React.Dispatch<React.SetStateAction<string | null>>
  ) {
    e.preventDefault();
    setOverSectionId(null);
    setDraggingSectionId(null);
    const sectionId = e.dataTransfer.getData("application/section-id");
    if (sectionId) {
      // Section drag is handled externally via moveSectionTo
      // (dispatched by the column header)
      return;
    }
    const cardId = e.dataTransfer.getData("application/card-id");
    if (cardId) moveCard(cardId, targetSectionId);
  }

  return {
    pendingCardIds,
    handleAdd,
    handleDeleteCard,
    handleEditCardSave,
    handleDuplicateCard,
    moveCard,
    handleCardReorder,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
  };
}
