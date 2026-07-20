"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AddCardButton } from "./AddCardButton";
import type { AddCardData } from "./AddCardModal";
import { CardDetailModal } from "./cards/CardDetailModal";
import { CardAuthorEditor, type SavedAuthor } from "./cards/CardAuthorEditor";
import { EditCardModal, type EditCardUpdates } from "./EditCardModal";
import type { CardData } from "./DraggableCard";
import { GridBoardCard } from "./GridBoardCard";
import { useBoardAnonymityChange } from "@/hooks/useBoardAnonymityChange";
import { useCardRealtime } from "@/hooks/useCardRealtime";
import { formatAuthorList } from "@/lib/card-author";
import {
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "@/lib/card-anonymity";
import {
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
  const studentViewerHeaders: Record<string, string> = isStudentViewer
    ? { "x-aura-student-viewer": "1" }
    : {};
  const showAuraControl = canEdit && !!auraSettings?.evaluationEnabled;
  const [auraLevels, setAuraLevels] = useState<
    Record<string, AuraEvaluationLevel>
  >(auraEvaluations ?? {});

  function handleAuraSaved(cardId: string, level: AuraEvaluationLevel) {
    setAuraLevels((map) => ({ ...map, [cardId]: level }));
  }

  const deletingIds = useRef<Set<string>>(new Set());
  useCardRealtime(boardId, setCards, deletingIds, undefined, !!isStudentViewer);

  const applyAnonymousAuthor = useCallback((next: boolean) => {
    setCards((list) => withBoardAnonymousAuthors(list, next));
    setOpenCard((card) => withBoardAnonymousAuthor(card, next));
    setEditingCard((card) => withBoardAnonymousAuthor(card, next));
    setAuthorEditCard((card) => withBoardAnonymousAuthor(card, next));
  }, []);

  useEffect(() => {
    applyAnonymousAuthor(anonymousAuthor);
  }, [anonymousAuthor, applyAnonymousAuthor]);

  useBoardAnonymityChange(boardId, applyAnonymousAuthor);

  async function handleAdd(data: AddCardData) {
    try {
      const res = await fetch(`/api/cards`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...studentViewerHeaders,
        },
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
        setCards((prev) => [
          ...prev,
          withBoardAnonymousAuthor(card, anonymousAuthor),
        ]);
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
      const res = await fetch(`/api/cards/${id}`, {
        method: "DELETE",
        headers: studentViewerHeaders,
      });
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
        headers: {
          "content-type": "application/json",
          ...studentViewerHeaders,
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        setCards(prevCards);
        return;
      }

      const refreshed = await fetch(`/api/cards/${cardId}`, {
        headers: studentViewerHeaders,
      }).catch(() => null);
      if (refreshed?.ok) {
        const data = await refreshed.json();
        if (data.card) {
          const refreshedCard = withBoardAnonymousAuthor(
            data.card,
            anonymousAuthor,
          );
          setCards((list) =>
            list.map((c) => (c.id === cardId ? refreshedCard : c)),
          );
          setOpenCard((card) => (card?.id === cardId ? refreshedCard : card));
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
        headers: {
          "content-type": "application/json",
          ...studentViewerHeaders,
        },
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
        setCards((prev) => [
          ...prev,
          withBoardAnonymousAuthor(newCard, anonymousAuthor),
        ]);
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
    setOpenCard((c) => (c?.id === card.id ? { ...c, guidePinned } : c));
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...studentViewerHeaders,
        },
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
  const previousOpenCard = openCardIndex > 0 ? cards[openCardIndex - 1] : null;
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
        {cards.map((card) => (
          <GridBoardCard
            key={card.id}
            card={card}
            boardId={boardId}
            isStudentViewer={isStudentViewer}
            canEdit={canEdit}
            canModify={
              currentRole === "owner" ||
              (currentRole === "editor" && card.authorId === currentUserId) ||
              card.studentAuthorId === currentUserId
            }
            showAuraControl={showAuraControl}
            auraLevel={auraLevels[card.id] ?? null}
            isOpen={openCard?.id === card.id}
            onOpen={() => setOpenCard(card)}
            onEdit={() => setEditingCard(card)}
            onEditAuthors={
              canEdit || card.studentAuthorId === currentUserId
                ? () => setAuthorEditCard(card)
                : undefined
            }
            onAuraSaved={(level) => handleAuraSaved(card.id, level)}
            onToggleGuide={(guidePinned) =>
              handleToggleGuide(card, guidePinned)
            }
            onDuplicate={() => handleDuplicate(card)}
            onDelete={() => {
              if (window.confirm(`"${card.title}" 카드를 삭제할까요?`)) {
                void handleDelete(card.id);
              }
            }}
          />
        ))}
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
        isStudentViewer={isStudentViewer}
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
          canConfigurePoll={
            canEdit || editingCard.studentAuthorId === currentUserId
          }
        />
      )}
      {authorEditCard && (
        <CardAuthorEditor
          cardId={authorEditCard.id}
          classroomId={classroomId ?? null}
          isStudentViewer={isStudentViewer}
          studentOwnerId={isStudentViewer ? currentUserId : null}
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
                c.id === authorEditCard.id ? { ...c, ...authorPatch } : c,
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
