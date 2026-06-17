"use client";

import { useState } from "react";
import type { AddCardData } from "./AddCardModal";
import type { CardData } from "./DraggableCard";
import { StreamComposer } from "./stream/StreamComposer";
import { StreamPost } from "./stream/StreamPost";

type Props = {
  boardId: string;
  initialCards: CardData[];
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  isStudentViewer?: boolean;
  classroomId?: string | null;
};

export function StreamBoard({
  boardId,
  initialCards,
  currentUserId,
  currentRole,
  isStudentViewer,
}: Props) {
  const [cards, setCards] = useState<CardData[]>(() => sortPosts(initialCards));
  const [composerOpen, setComposerOpen] = useState(false);
  const canEdit = currentRole === "owner" || currentRole === "editor";
  const canAddPost = canEdit || !!isStudentViewer;

  async function handleAdd(data: AddCardData) {
    const res = await fetch("/api/cards", {
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
        x: 0,
        y: 0,
        order: cards.length,
      }),
    });
    if (!res.ok) {
      alert(`게시글 작성에 실패했어요: ${await res.text()}`);
      throw new Error("Failed to create stream post");
    }
    const { card } = (await res.json()) as { card: CardData };
    setCards((prev) => sortPosts([card, ...prev]));
  }

  async function handleDelete(card: CardData) {
    if (!window.confirm("게시글을 삭제할까요?")) return;
    const prev = cards;
    setCards((list) => list.filter((item) => item.id !== card.id));
    try {
      const res = await fetch(`/api/cards/${card.id}`, { method: "DELETE" });
      if (!res.ok) setCards(prev);
    } catch {
      setCards(prev);
    }
  }

  return (
    <div className="board-canvas-wrap stream-board-wrap">
      <div className="stream-feed">
        {cards.length === 0 ? (
          <div className="stream-empty">
            {canAddPost ? "첫 게시글을 남겨보세요." : "아직 게시글이 없어요."}
          </div>
        ) : (
          cards.map((card) => (
            <StreamPost
              key={card.id}
              card={card}
              canDelete={canDeleteCard(card, currentUserId, currentRole)}
              onDelete={() => handleDelete(card)}
            />
          ))
        )}
      </div>
      {canAddPost && (
        <>
          <button
            type="button"
            className="add-card-fab"
            onClick={() => setComposerOpen(true)}
            aria-label="게시글 작성"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          {composerOpen && (
            <>
              <div
                className="modal-backdrop"
                onClick={() => setComposerOpen(false)}
              />
              <div className="add-card-modal stream-composer-modal">
                <div className="modal-header">
                  <h2 className="modal-title">게시글 작성</h2>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={() => setComposerOpen(false)}
                  >
                    닫기
                  </button>
                </div>
                <div className="modal-body">
                  <StreamComposer
                    onAdd={handleAdd}
                    onSubmitted={() => setComposerOpen(false)}
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function sortPosts(cards: CardData[]): CardData[] {
  return [...cards].sort((a, b) => {
    const byCreatedAt =
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    return byCreatedAt || b.order - a.order;
  });
}

function canDeleteCard(
  card: CardData,
  currentUserId: string,
  currentRole: "owner" | "editor" | "viewer",
): boolean {
  if (currentRole === "owner") return true;
  if (currentRole === "editor" && card.authorId === currentUserId) return true;
  return card.studentAuthorId === currentUserId;
}
