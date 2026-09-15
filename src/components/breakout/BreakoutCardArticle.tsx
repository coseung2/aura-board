"use client";

import { CardBody } from "../cards/CardBody";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import type { CardData } from "../DraggableCard";

type Props = {
  card: CardData;
  canEdit: boolean;
  menuItems: MenuItem[];
  onOpen: (card: CardData) => void;
  style?: React.CSSProperties;
};

export function BreakoutCardArticle({
  card,
  canEdit,
  menuItems,
  onOpen,
  style,
}: Props) {
  return (
    <article
      className="column-card is-clickable"
      style={{ backgroundColor: card.color ?? undefined, ...style }}
      onClick={() => onOpen(card)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(card);
        }
      }}
      tabIndex={0}
      role="button"
    >
      <CardBody
        card={card}
        titleAs="h4"
        cardMenu={
          canEdit ? (
            <div className="card-ctx-menu" onClick={(e) => e.stopPropagation()}>
              <ContextMenu items={menuItems} />
            </div>
          ) : null
        }
      />
    </article>
  );
}
