"use client";

import { useState } from "react";
import { AddCardButton } from "./AddCardButton";
import { CardBody } from "./cards/CardBody";
import { CardDetailModal } from "./cards/CardDetailModal";
import { CardAuthorEditor, type SavedAuthor } from "./cards/CardAuthorEditor";
import type { CardData } from "./DraggableCard";

type Props = {
  boardId: string;
  initialCards: CardData[];
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  isStudentViewer?: boolean;
  classroomId?: string | null;
};

export function GridBoard({ boardId, initialCards, currentUserId, currentRole, isStudentViewer, classroomId }: Props) {
  const [cards, setCards] = useState<CardData[]>(
    [...initialCards].sort((a, b) => a.order - b.order)
  );
  const [openCard, setOpenCard] = useState<CardData | null>(null);
  const [authorEditCard, setAuthorEditCard] = useState<CardData | null>(null);
  const canEdit = currentRole === "owner" || currentRole === "editor";
  const canAddCard = canEdit || !!isStudentViewer;

  async function handleAdd(data: {
    title: string;
    content: string;
    linkUrl?: string;
    linkTitle?: string;
    linkDesc?: string;
    linkImage?: string;
    attachments?: Array<{
      kind: "image" | "video" | "file" | "link";
      url: string;
      previewUrl?: string | null;
      fileName?: string | null;
      fileSize?: number | null;
      mimeType?: string | null;
    }>;
    color?: string;
  }) {
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
          order: cards.length,
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

  async function handleDelete(id: string) {
    const prev = cards;
    setCards((list) => list.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/cards/${id}`, { method: "DELETE" });
      if (!res.ok) setCards(prev);
    } catch {
      setCards(prev);
    }
  }

  return (
    <div className="board-canvas-wrap">
      <div className="grid-board">
        {cards.length === 0 && (
          <div className="board-empty-inline">
            <p>{canEdit ? "카드를 추가해서 그리드를 채워보세요." : "아직 카드가 없습니다."}</p>
          </div>
        )}
        {cards.map((c) => (
          <article
            key={c.id}
            className="grid-card is-clickable"
            style={{ backgroundColor: c.color ?? undefined }}
            aria-label={c.title}
            onClick={() => setOpenCard(c)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpenCard(c);
              }
            }}
            tabIndex={0}
            role="button"
          >
            <CardBody card={c} />
            {(currentRole === "owner" ||
              (currentRole === "editor" && c.authorId === currentUserId) ||
              c.studentAuthorId === currentUserId) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`"${c.title}" 카드를 삭제할까요?`)) handleDelete(c.id);
                }}
                className="padlet-card-delete"
                aria-label={`${c.title} 삭제`}
              >
                ×
              </button>
            )}
          </article>
        ))}
      </div>
      {canAddCard && <AddCardButton onAdd={handleAdd} />}
      <CardDetailModal
        card={openCard}
        onClose={() => setOpenCard(null)}
        cards={cards}
        onChange={setOpenCard}
        onEditAuthors={(c) => setAuthorEditCard(c)}
        canEditAuthors={(c) => canEdit || c.studentAuthorId === currentUserId}
      />
      {authorEditCard && (
        <CardAuthorEditor
          cardId={authorEditCard.id}
          classroomId={classroomId ?? null}
          initialAuthors={(authorEditCard.authors ?? []).map((a) => ({
            id: a.id,
            studentId: a.studentId,
            displayName: a.displayName,
            order: a.order,
          }))}
          onSaved={(authors: SavedAuthor[]) => {
            setCards((prev) =>
              prev.map((c) =>
                c.id === authorEditCard.id ? { ...c, authors } : c
              )
            );
          }}
          onClose={() => setAuthorEditCard(null)}
        />
      )}
    </div>
  );
}
