"use client";

import { useState } from "react";
import type { CardData } from "../DraggableCard";
import { DJQueueItem } from "./DJQueueItem";

type Props = {
  cards: CardData[];
  canControl: boolean;
  currentStudentId: string | null;
  startRank?: number;
  onStatus: (
    cardId: string,
    status: "approved" | "rejected" | "played"
  ) => void;
  onDelete: (cardId: string) => void;
  onReorder: (cardId: string, newOrder: number) => void;
};

export function DJQueueList({
  cards,
  canControl,
  currentStudentId,
  startRank = 1,
  onStatus,
  onDelete,
  onReorder,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function handleDragStart(
    e: React.DragEvent<HTMLLIElement>,
    cardId: string
  ) {
    if (!canControl) return;
    setDraggingId(cardId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", cardId);
  }

  function handleDragOver(
    e: React.DragEvent<HTMLLIElement>,
    cardId: string
  ) {
    if (!canControl || !draggingId) return;
    e.preventDefault();
    setOverId(cardId);
  }

  function handleDrop(
    e: React.DragEvent<HTMLLIElement>,
    targetCardId: string
  ) {
    if (!canControl || !draggingId) return;
    e.preventDefault();
    setOverId(null);
    const draggedId = draggingId;
    setDraggingId(null);
    if (draggedId === targetCardId) return;
    const target = cards.find((c) => c.id === targetCardId);
    if (!target) return;
    // "insert at target.order" — 서버가 target.order 이상인 카드들을 +1 밀어내고
    // 이동 카드를 그 자리에 삽입해서 target 바로 앞에 꽂히게 됨.
    onReorder(draggedId, target.order);
  }

  return (
    <ul className="dj-queue-list">
      {cards.map((card, idx) => {
        const isOwnPending =
          card.queueStatus === "pending" &&
          !!currentStudentId &&
          card.studentAuthorId === currentStudentId;
        return (
          <DJQueueItem
            key={card.id}
            card={card}
            rank={startRank + idx}
            canControl={canControl}
            isOwnPending={isOwnPending}
            isDragging={draggingId === card.id}
            isDragOver={overId === card.id}
            onDragStart={(e) => handleDragStart(e, card.id)}
            onDragOver={(e) => handleDragOver(e, card.id)}
            onDrop={(e) => handleDrop(e, card.id)}
            onApprove={() => onStatus(card.id, "approved")}
            onReject={() => onStatus(card.id, "rejected")}
            onMarkPlayed={() => onStatus(card.id, "played")}
            onDelete={() => onDelete(card.id)}
          />
        );
      })}
    </ul>
  );
}
