"use client";

import { useRef, useState, type MutableRefObject } from "react";
import type { CardData } from "../DraggableCard";
import type { AddCardData } from "../AddCardModal";
import type { EditCardUpdates } from "../EditCardModal";

type UseCardMutationsOptions = {
  boardId: string;
  canEdit: boolean;
  sections: { id: string; order: number; pinned: boolean }[];
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
  setCards,
}: UseCardMutationsOptions): UseCardMutationsReturn {
  const pendingCardIds = useRef<Set<string>>(new Set());

  function trackCardMutation<T>(id: string, run: () => Promise<T>): Promise<T> {
    pendingCardIds.current.add(id);
    return run().finally(() => {
      pendingCardIds.current.delete(id);
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
      ? getCardsForSection(targetSection, []).length
      : 0;
    // Note: order is recalculated from state inside the callback below.
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
    setCards((list) => {
      prevCards.push(...list);
      return list.filter((c) => c.id !== id);
    });
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
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
  };
}
