"use client";

import { useLayoutEffect, useRef, useState } from "react";
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
  AuraEvaluationControl,
  type AuraBoardSettings,
  type AuraEvaluationLevel,
} from "./AuraEvaluationControl";

type Role = "owner" | "editor" | "viewer";

type Props = {
  boardId: string;
  initialCards: CardData[];
  currentUserId: string;
  currentRole: Role;
  isStudentViewer?: boolean;
  classroomId?: string | null;
  auraSettings?: AuraBoardSettings;
  auraEvaluations?: Record<string, AuraEvaluationLevel>;
};

export function BoardCanvas({
  boardId,
  initialCards,
  currentUserId,
  currentRole,
  isStudentViewer,
  classroomId,
  auraSettings,
  auraEvaluations,
}: Props) {
  const [cards, setCards] = useState<CardData[]>(
    [...initialCards].sort((a, b) => a.order - b.order),
  );
  const [openCard, setOpenCard] = useState<CardData | null>(null);
  const [editingCard, setEditingCard] = useState<CardData | null>(null);
  const [authorEditCard, setAuthorEditCard] = useState<CardData | null>(null);
  const canEdit = currentRole === "owner" || currentRole === "editor";
  const canAddCard = canEdit || !!isStudentViewer;
  const showAuraControl =
    canEdit &&
    !!auraSettings?.evaluationEnabled &&
    !!auraSettings.subject &&
    !!auraSettings.unit &&
    !!auraSettings.criterion;
  const [auraLevels, setAuraLevels] = useState<
    Record<string, AuraEvaluationLevel>
  >(auraEvaluations ?? {});

  const deletingIds = useRef<Set<string>>(new Set());
  const masonryGridRef = useRef<HTMLDivElement | null>(null);
  const masonryCardRefs = useRef(new Map<string, HTMLElement>());
  useCardRealtime(boardId, setCards, deletingIds);

  useLayoutEffect(() => {
    const grid = masonryGridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;

    let frame = 0;
    const resizeCard = (cardEl: HTMLElement) => {
      const gridStyle = window.getComputedStyle(grid);
      const rowHeight =
        parseFloat(gridStyle.getPropertyValue("--masonry-row-height")) || 8;
      const rowGap = parseFloat(gridStyle.rowGap) || 0;
      const cardHeight = cardEl.getBoundingClientRect().height;
      const span = Math.ceil((cardHeight + rowGap) / (rowHeight + rowGap));
      cardEl.style.gridRowEnd = `span ${Math.max(1, span)}`;
    };
    const resizeAll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        for (const cardEl of masonryCardRefs.current.values()) {
          resizeCard(cardEl);
        }
      });
    };

    const observer = new ResizeObserver((entries) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        for (const entry of entries) {
          resizeCard(entry.target as HTMLElement);
        }
      });
    });

    for (const cardEl of masonryCardRefs.current.values()) {
      observer.observe(cardEl);
      resizeCard(cardEl);
    }
    window.addEventListener("resize", resizeAll);
    resizeAll();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resizeAll);
    };
  }, [cards]);

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
        const msg = await res.text();
        console.error("Failed to add card:", msg);
        alert(`카드 추가 실패: ${msg}`);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    deletingIds.current.add(id);
    const prevCards = cards;
    setCards((list) => list.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/cards/${id}`, { method: "DELETE" });
      if (!res.ok) {
        deletingIds.current.delete(id);
        setCards(prevCards);
        const msg = await res.text();
        console.error("Failed to delete card:", msg);
        alert(`카드 삭제 실패: ${msg}`);
      }
    } catch (err) {
      console.error(err);
      deletingIds.current.delete(id);
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
      <div ref={masonryGridRef} className="grid-board freeform-board">
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
            ref={(node) => {
              if (node) masonryCardRefs.current.set(c.id, node);
              else masonryCardRefs.current.delete(c.id);
            }}
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
                onSaved={(level) =>
                  setAuraLevels((map) => ({ ...map, [c.id]: level }))
                }
              />
            )}
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
