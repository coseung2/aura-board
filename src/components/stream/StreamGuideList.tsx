import type { CardData } from "../DraggableCard";
import { StreamPost } from "./StreamPost";
import {
  canDeleteCard,
  canToggleGuideCard,
} from "./stream-board-model";

type Props = {
  cards: CardData[];
  boardId: string;
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  canToggleGuide: boolean;
  isStudentViewer: boolean;
  guideBusyId: string | null;
  onEditCard: (card: CardData) => void;
  onOpenCard: (card: CardData) => void;
  onDeleteCard: (card: CardData) => void;
  onToggleGuide: (card: CardData, guidePinned: boolean) => void;
};

export function StreamGuideList({
  cards,
  boardId,
  currentUserId,
  currentRole,
  canToggleGuide,
  isStudentViewer,
  guideBusyId,
  onEditCard,
  onOpenCard,
  onDeleteCard,
  onToggleGuide,
}: Props) {
  if (cards.length === 0) return null;
  return (
    <div className="stream-section-guide-list" aria-label="섹션 가이드">
      <div className="stream-section-guide-label">가이드</div>
      <div className="stream-post-grid stream-section-guide-grid">
        {cards.map((card) => (
          <StreamPost
            key={card.id}
            card={card}
            canEdit={canDeleteCard(card, currentUserId, currentRole)}
            onEdit={() => onEditCard(card)}
            onOpen={() => onOpenCard(card)}
            canDelete={canDeleteCard(card, currentUserId, currentRole)}
            onDelete={() => onDeleteCard(card)}
            canToggleGuide={canToggleGuideCard(card, canToggleGuide)}
            guideBusy={guideBusyId === card.id}
            onToggleGuide={(guidePinned) =>
              onToggleGuide(card, guidePinned)
            }
            boardId={boardId}
            isStudentViewer={isStudentViewer}
          />
        ))}
      </div>
    </div>
  );
}
