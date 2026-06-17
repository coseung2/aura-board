"use client";

import { useState } from "react";
import { AddCardButton } from "./AddCardButton";
import type { AddCardData } from "./AddCardModal";
import { CardBody } from "./cards/CardBody";
import { CardDetailModal } from "./cards/CardDetailModal";
import { CardAuthorEditor, type SavedAuthor } from "./cards/CardAuthorEditor";
import { ContextMenu } from "./ContextMenu";
import { EditCardModal, type EditCardUpdates } from "./EditCardModal";
import type { CardData } from "./DraggableCard";

type Role = "owner" | "editor" | "viewer";

type Props = {
  boardId: string;
  initialCards: CardData[];
  currentUserId: string;
  currentRole: Role;
  isStudentViewer?: boolean;
  classroomId?: string | null;
};

export function BoardCanvas({
  boardId,
  initialCards,
  currentUserId,
  currentRole,
  isStudentViewer,
  classroomId,
}: Props) {
  const [cards, setCards] = useState<CardData[]>(
    [...initialCards].sort((a, b) => a.order - b.order),
  );
  const [openCard, setOpenCard] = useState<CardData | null>(null);
  const [editingCard, setEditingCard] = useState<CardData | null>(null);
  const [authorEditCard, setAuthorEditCard] = useState<CardData | null>(null);
  const canEdit = currentRole === "owner" || currentRole === "editor";
  const canAddCard = canEdit || !!isStudentViewer;

  async function handleAdd(data: AddCardData) {
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
          authors: data.authors,
          color: data.color || null,
          x: 0,
          y: 0,
          order: cards.length,
        }),
      });
      if (res.ok) {
        const { card } = await res.json();
        setCards((prev) => [...prev, card]);
        if (data.attachAssetId) {
          void fetch(`/api/student-assets/${data.attachAssetId}/attach`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cardId: card.id }),
          }).catch(() => {});
        }
      } else {
        const msg = await res.text();
        console.error("Failed to add card:", msg);
        alert(`카드 추가 실패: ${msg}`);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    const prevCards = cards;
    setCards((list) => list.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/cards/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setCards(prevCards);
        const msg = await res.text();
        console.error("Failed to delete card:", msg);
        alert(`카드 삭제 실패: ${msg}`);
      }
    } catch (err) {
      console.error(err);
      setCards(prevCards);
    }
  }

  async function handleEditCardSave(
    editingCard: CardData | null,
    updates: EditCardUpdates,
  ) {
    if (!editingCard) return;
    const prevCards = cards;
    const cardId = editingCard.id;
    const { attachments: updateAttachments, ...restUpdates } = updates;
    const optimisticUpdates: Partial<CardData> = { ...restUpdates };

    if (updateAttachments) {
      optimisticUpdates.attachments = updateAttachments.map((a, idx) => ({
        id:
          a.tempId && !a.tempId.startsWith("legacy-") && !a.tempId.startsWith("tmp-")
            ? a.tempId
            : `opt-${idx}-${a.kind}`,
        kind: a.kind,
        url: a.url,
        previewUrl: a.previewUrl ?? null,
        fileName: a.fileName ?? null,
        fileSize: a.fileSize ?? null,
        mimeType: a.mimeType ?? null,
        order: idx,
      }));
    }

    setCards((list) =>
      list.map((c) => (c.id === cardId ? { ...c, ...optimisticUpdates } : c)),
    );
    setOpenCard((card) =>
      card?.id === cardId ? { ...card, ...optimisticUpdates } : card,
    );

    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        setCards(prevCards);
        return;
      }

      const refreshed = await fetch(`/api/cards/${cardId}`).catch(() => null);
      if (refreshed?.ok) {
        const data = await refreshed.json();
        if (data.card) {
          setCards((list) =>
            list.map((c) => (c.id === cardId ? data.card : c)),
          );
          setOpenCard((card) => (card?.id === cardId ? data.card : card));
        }
      }
    } catch (err) {
      console.error(err);
      setCards(prevCards);
    }
  }

  async function handleDuplicate(card: CardData) {
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
          fileUrl: card.fileUrl || null,
          fileName: card.fileName || null,
          fileSize: card.fileSize || null,
          fileMimeType: card.fileMimeType || null,
          attachments: (card.attachments ?? []).map((a) => ({
            kind: a.kind,
            url: a.url,
            previewUrl: a.previewUrl ?? null,
            fileName: a.fileName,
            fileSize: a.fileSize,
            mimeType: a.mimeType,
          })),
          color: card.color || null,
          x: 0,
          y: 0,
          order: cards.length,
        }),
      });
      if (res.ok) {
        const { card: newCard } = await res.json();
        setCards((prev) => [...prev, newCard]);
      } else {
        alert(`카드 복제 실패: ${await res.text()}`);
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="board-canvas-wrap">
      <div className="grid-board freeform-board">
        {cards.length === 0 && (
          <div className="board-empty-inline">
            {canEdit ? (
              <p>아직 카드가 없어요. 더하기 버튼을 눌러 첫 카드를 추가하세요.</p>
            ) : (
              <p>아직 카드가 없습니다.</p>
            )}
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
              <div
                className="card-ctx-menu"
                onClick={(e) => e.stopPropagation()}
              >
                <ContextMenu
                  items={[
                    {
                      label: "수정",
                      onClick: () => setEditingCard(c),
                    },
                    ...(canEdit || c.studentAuthorId === currentUserId
                      ? [
                          {
                            label: "작성자 지정",
                            onClick: () => setAuthorEditCard(c),
                          },
                        ]
                      : []),
                    {
                      label: "복제",
                      onClick: () => handleDuplicate(c),
                    },
                    {
                      label: "삭제",
                      danger: true,
                      onClick: () => {
                        if (window.confirm(`"${c.title}" 카드를 삭제할까요?`)) {
                          handleDelete(c.id);
                        }
                      },
                    },
                  ]}
                />
              </div>
            )}
          </article>
        ))}
      </div>
      {canAddCard && (
        <AddCardButton
          onAdd={handleAdd}
          canAssignAuthors={canEdit}
          classroomId={classroomId}
        />
      )}
      <CardDetailModal
        card={openCard}
        onClose={() => setOpenCard(null)}
        cards={cards}
        onChange={setOpenCard}
        onEditAuthors={(c) => setAuthorEditCard(c)}
        canEditAuthors={(c) => canEdit || c.studentAuthorId === currentUserId}
      />
      {editingCard && (
        <EditCardModal
          card={editingCard}
          onSave={(updates) => handleEditCardSave(editingCard, updates)}
          onClose={() => setEditingCard(null)}
        />
      )}
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
                c.id === authorEditCard.id
                  ? {
                      ...c,
                      authors,
                      studentAuthorId: authors[0]?.studentId ?? null,
                      externalAuthorName:
                        authors.length > 0
                          ? authors.map((a) => a.displayName).join(", ")
                          : c.externalAuthorName,
                    }
                  : c,
              ),
            );
          }}
          onClose={() => setAuthorEditCard(null)}
        />
      )}
    </div>
  );
}
