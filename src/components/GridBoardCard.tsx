"use client";

import type { KeyboardEvent } from "react";
import { CardBody } from "./cards/CardBody";
import { ContextMenu } from "./ContextMenu";
import type { CardData } from "./DraggableCard";
import {
  AuraEvaluationControl,
  type AuraEvaluationLevel,
} from "./AuraEvaluationControl";

type Props = {
  card: CardData;
  boardId: string;
  isStudentViewer?: boolean;
  canEdit: boolean;
  canModify: boolean;
  showAuraControl: boolean;
  auraLevel: AuraEvaluationLevel | null;
  isOpen: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onEditAuthors?: () => void;
  onAuraSaved: (level: AuraEvaluationLevel) => void;
  onToggleGuide: (guidePinned: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

/**
 * A single grid card surface. Keeping the card interaction boundary here
 * makes the board's list orchestration easier to audit without changing the
 * existing CardBody, context menu, or modal contracts.
 */
export function GridBoardCard({
  card,
  boardId,
  isStudentViewer,
  canEdit,
  canModify,
  showAuraControl,
  auraLevel,
  isOpen,
  onOpen,
  onEdit,
  onEditAuthors,
  onAuraSaved,
  onToggleGuide,
  onDuplicate,
  onDelete,
}: Props) {
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    // Nested controls (content toggle, engagement, context menu) own their
    // keyboard interaction; opening the card as well would be surprising.
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  }

  return (
    <article
      className="grid-card is-clickable"
      style={{ backgroundColor: card.color ?? undefined }}
      aria-label={card.title.trim() || "카드"}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
    >
      <CardBody
        card={card}
        boardId={boardId}
        isStudentViewer={isStudentViewer}
        onEditAuthors={onEditAuthors}
      />
      {showAuraControl && (
        <AuraEvaluationControl
          cardId={card.id}
          initialLevel={auraLevel}
          onSaved={onAuraSaved}
        />
      )}
      {canModify && (
        <div
          className="card-ctx-menu"
          onClick={(event) => event.stopPropagation()}
        >
          <ContextMenu
            items={[
              {
                label: "수정",
                onClick: onEdit,
              },
              ...(canEdit && !!card.authorId && !card.studentAuthorId
                ? [
                    {
                      label: card.guidePinned ? "가이드 해제" : "가이드 고정",
                      onClick: () => onToggleGuide(!card.guidePinned),
                    },
                  ]
                : []),
              {
                label: "복제",
                onClick: onDuplicate,
              },
              {
                label: "삭제",
                danger: true,
                onClick: onDelete,
              },
            ]}
          />
        </div>
      )}
    </article>
  );
}
