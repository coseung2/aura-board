"use client";

import { useEffect, useRef, useState } from "react";
import { AddCardButton } from "./AddCardButton";
import type { AddCardData } from "./AddCardModal";
import { CardBody } from "./cards/CardBody";
import { CardDetailModal } from "./cards/CardDetailModal";
import { CardAuthorEditor, type SavedAuthor } from "./cards/CardAuthorEditor";
import { ContextMenu } from "./ContextMenu";
import { EditCardModal, type EditCardUpdates } from "./EditCardModal";
import type { CardData } from "./DraggableCard";
import { useCardRealtime } from "@/hooks/useCardRealtime";
import { formatAuthorList } from "@/lib/card-author";
import {
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "@/lib/card-anonymity";
import {
  AuraEvaluationControl,
  type AuraBoardSettings,
  type AuraEvaluationLevel,
} from "./AuraEvaluationControl";

type Props = {
  boardId: string;
  initialCards: CardData[];
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  isStudentViewer?: boolean;
  classroomId?: string | null;
  anonymousAuthor?: boolean;
  auraSettings?: AuraBoardSettings;
  auraEvaluations?: Record<string, AuraEvaluationLevel>;
};

export function GridBoard({
  boardId,
  initialCards,
  currentUserId,
  currentRole,
  isStudentViewer,
  classroomId,
  anonymousAuthor = false,
  auraSettings,
  auraEvaluations,
}: Props) {
  const [cards, setCards] = useState<CardData[]>(
    withBoardAnonymousAuthors(
      [...initialCards].sort((a, b) => a.order - b.order),
      anonymousAuthor,
    ),
  );
  const [openCard, setOpenCard] = useState<CardData | null>(null);
  const [editingCard, setEditingCard] = useState<CardData | null>(null);
  const [authorEditCard, setAuthorEditCard] = useState<CardData | null>(null);
  const canEdit = currentRole === "owner" || currentRole === "editor";
  const canAddCard = canEdit || !!isStudentViewer;
  const showAuraControl = canEdit && !!auraSettings?.evaluationEnabled;
  const [auraLevels, setAuraLevels] = useState<
    Record<string, AuraEvaluationLevel>
  >(auraEvaluations ?? {});

  function handleAuraSaved(cardId: string, level: AuraEvaluationLevel) {
    setAuraLevels((map) => ({ ...map, [cardId]: level }));
  }

  const deletingIds = useRef<Set<string>>(new Set());
  useCardRealtime(boardId, setCards, deletingIds);

  useEffect(() => {
    setCards((list) => withBoardAnonymousAuthors(list, anonymousAuthor));
    setOpenCard((card) => withBoardAnonymousAuthor(card, anonymousAuthor));
    setEditingCard((card) => withBoardAnonymousAuthor(card, anonymousAuthor));
    setAuthorEditCard((card) => withBoardAnonymousAuthor(card, anonymousAuthor));
  }, [anonymousAuthor]);

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
          commentVoteOptionCount: data.commentVoteOptionCount ?? null,
          commentVoteOptionLabels: data.commentVoteOptionLabels ?? null,
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
    deletingIds.current.add(id);
    const prev = cards;
    setCards((list) => list.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/cards/${id}`, { method: "DELETE" });
      if (!res.ok) {
        deletingIds.current.delete(id);
        setCards(prev);
      }
    } catch {
      deletingIds.current.delete(id);
      setCards(prev);
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
          a.tempId &&
          !a.tempId.startsWith("legacy-") &&
          !a.tempId.startsWith("tmp-")
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

  async function handleToggleGuide(card: CardData, guidePinned: boolean) {
    const prevCards = cards;
    const prevOpenCard = openCard;
    setCards((list) =>
      list.map((c) => (c.id === card.id ? { ...c, guidePinned } : c)),
    );
    setOpenCard((c) =>
      c?.id === card.id ? { ...c, guidePinned } : c,
    );
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guidePinned }),
      });
      if (!res.ok) {
        setCards(prevCards);
        setOpenCard(prevOpenCard);
        alert("가이드 설정에 실패했어요.");
      }
    } catch (err) {
      console.error(err);
      setCards(prevCards);
      setOpenCard(prevOpenCard);
      alert("가이드 설정에 실패했어요.");
    }
  }

  const openCardIndex = openCard
    ? cards.findIndex((card) => card.id === openCard.id)
    : -1;
  const previousOpenCard =
    openCardIndex > 0 ? cards[openCardIndex - 1] : null;
  const nextOpenCard =
    openCardIndex >= 0 && openCardIndex < cards.length - 1
      ? cards[openCardIndex + 1]
      : null;

  return (
    <div className="board-canvas-wrap">
      <div className="grid-board">
        {cards.length === 0 && (
          <div className="board-empty-inline">
            <p>
              {canEdit
                ? "카드를 추가해서 그리드를 채워보세요."
                : "아직 카드가 없습니다."}
            </p>
          </div>
        )}
        {cards.map((c) => {
          const canModify =
            currentRole === "owner" ||
            (currentRole === "editor" && c.authorId === currentUserId) ||
            c.studentAuthorId === currentUserId;

          return (
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
              <CardBody
                card={c}
                boardId={boardId}
                onEditAuthors={
                  canEdit || c.studentAuthorId === currentUserId
                    ? () => setAuthorEditCard(c)
                    : undefined
                }
              />
              {showAuraControl && (
                <AuraEvaluationControl
                  cardId={c.id}
                  initialLevel={auraLevels[c.id] ?? null}
                  onSaved={(level) => handleAuraSaved(c.id, level)}
                />
              )}
              {canModify && (
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
                      ...(canEdit && !!c.authorId && !c.studentAuthorId
                        ? [
                            {
                              label: c.guidePinned ? "가이드 해제" : "가이드 고정",
                              onClick: () => handleToggleGuide(c, !c.guidePinned),
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
          );
        })}
      </div>
      {canAddCard && (
        <AddCardButton
          onAdd={handleAdd}
          canAssignAuthors={canEdit}
          canConfigurePoll={canEdit || !!isStudentViewer}
          classroomId={classroomId}
        />
      )}
      <CardDetailModal
        card={openCard}
        onClose={() => setOpenCard(null)}
        hasPrevious={!!previousOpenCard}
        hasNext={!!nextOpenCard}
        onPrevious={
          previousOpenCard ? () => setOpenCard(previousOpenCard) : undefined
        }
        onNext={nextOpenCard ? () => setOpenCard(nextOpenCard) : undefined}
        onEditAuthors={(c) => setAuthorEditCard(c)}
        canEditAuthors={(c) => canEdit || c.studentAuthorId === currentUserId}
        boardId={boardId}
        auraEvaluation={
          showAuraControl && openCard
            ? {
                enabled: true,
                level: auraLevels[openCard.id] ?? null,
                onSaved: handleAuraSaved,
              }
            : undefined
        }
      />
      {editingCard && (
        <EditCardModal
          card={editingCard}
          onSave={(updates) => handleEditCardSave(editingCard, updates)}
          onClose={() => setEditingCard(null)}
          canConfigurePoll={canEdit || editingCard.studentAuthorId === currentUserId}
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
            const authorPatch: Partial<CardData> = {
              authors,
              studentAuthorId: authors[0]?.studentId ?? null,
              externalAuthorName:
                authors.length > 0
                  ? formatAuthorList(authors, null, null, null)
                  : null,
            };
            setCards((prev) =>
              prev.map((c) =>
                c.id === authorEditCard.id
                  ? { ...c, ...authorPatch }
                  : c,
              ),
            );
            setOpenCard((current) =>
              current?.id === authorEditCard.id
                ? { ...current, ...authorPatch }
                : current,
            );
            setAuthorEditCard((current) =>
              current?.id === authorEditCard.id
                ? { ...current, ...authorPatch }
                : current,
            );
          }}
          onClose={() => setAuthorEditCard(null)}
        />
      )}
    </div>
  );
}
