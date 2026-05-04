"use client";

import type { CardData } from "../DraggableCard";
import { CardBody } from "../cards/CardBody";
import { ContextMenu } from "../ContextMenu";
import { ColumnMenu } from "./ColumnMenu";
import type { SortMode } from "./sort";
import type { RosterEntry } from "./useColumnRoster";

type Props = {
  section: { id: string; title: string };
  sectionCards: CardData[];
  canEdit: boolean;
  currentRole: "owner" | "editor" | "viewer";
  currentUserId: string;
  classroomId?: string | null;
  sortMode: SortMode;
  overSectionId: string | null;
  draggingSectionId: string | null;
  organizing: string | null;
  authorsForSection: (cards: CardData[]) => RosterEntry[];
  studentForSectionTitle: (title: string) => RosterEntry | null;
  onSetSort: (mode: SortMode) => void;
  onSectionDragStart: (id: string) => void;
  onSectionDragEnd: () => void;
  onCardDragStart: (e: React.DragEvent, cardId: string) => void;
  onCardDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (id: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetId: string) => void;
  onRename: () => void;
  onDelete: () => void;
  onFolder: () => void;
  onExport: () => void;
  onOrganize: () => void;
  onFeedback: (args: {
    studentId: string | null;
    name: string | null;
    number: number | null;
    roster: RosterEntry[];
    sectionId: string;
  }) => void;
  onCardOpen: (card: CardData) => void;
  onCardEdit: (card: CardData) => void;
  onCardEditAuthors: (card: CardData) => void;
  onCardDuplicate: (card: CardData) => void;
  onCardDelete: (id: string) => void;
  onAddInColumn: () => void;
};

export function ColumnView(props: Props) {
  const {
    section,
    sectionCards,
    canEdit,
    currentRole,
    currentUserId,
    classroomId,
    sortMode,
    overSectionId,
    draggingSectionId,
    organizing,
    authorsForSection,
    studentForSectionTitle,
    onSetSort,
    onSectionDragStart,
    onSectionDragEnd,
    onCardDragStart,
    onCardDragEnd,
    onDragOver,
    onDragEnter,
    onDragLeave,
    onDrop,
    onRename,
    onDelete,
    onFolder,
    onExport,
    onOrganize,
    onFeedback,
    onCardOpen,
    onCardEdit,
    onCardEditAuthors,
    onCardDuplicate,
    onCardDelete,
    onAddInColumn,
  } = props;

  const hasCanva = sectionCards.some(
    (c) =>
      c.linkUrl &&
      (c.linkUrl.includes("canva.link") || c.linkUrl.includes("canva.com"))
  );

  const sectionStudent = canEdit ? studentForSectionTitle(section.title) : null;

  const menuItems = canEdit ? buildMenuItems() : [];

  function buildMenuItems() {
    const items: Array<{
      label: string;
      icon: string;
      onClick: () => void;
      danger?: boolean;
    }> = [
      { label: "이름 변경", icon: "✏️", onClick: onRename },
    ];

    if (classroomId) {
      const sectionAuthors = authorsForSection(sectionCards);
      const seedRow = sectionStudent
        ? sectionAuthors.find((s) => s.id === sectionStudent.id) ?? {
            id: sectionStudent.id,
            name: sectionStudent.name,
            number: sectionStudent.number,
          }
        : null;
      const modalRoster = seedRow
        ? sectionAuthors.some((s) => s.id === seedRow.id)
          ? sectionAuthors
          : [seedRow, ...sectionAuthors]
        : sectionAuthors;
      if (modalRoster.length > 0) {
        const labelSuffix = sectionStudent
          ? ` (${sectionStudent.name})`
          : ` (${modalRoster.length}명)`;
        items.push({
          label: `AI 평어 작성${labelSuffix}`,
          icon: "✨",
          onClick: () =>
            onFeedback({
              studentId: sectionStudent?.id ?? null,
              name: sectionStudent?.name ?? null,
              number: sectionStudent?.number ?? null,
              roster: modalRoster,
              sectionId: section.id,
            }),
        });
      }
    }

    items.push({
      label: "Canva에서 가져오기",
      icon: "📁",
      onClick: onFolder,
    });

    if (hasCanva) {
      items.push({
        label: "PDF 내보내기",
        icon: "📄",
        onClick: onExport,
      });
      items.push({
        label: organizing === section.id ? "정리 중..." : "Canva 폴더로 정리",
        icon: "📂",
        onClick: onOrganize,
      });
    }

    items.push({
      label: "섹션 삭제",
      icon: "🗑️",
      danger: true,
      onClick: onDelete,
    });

    return items;
  }

  return (
    <div
      className="column"
      onDragOver={onDragOver}
      onDragEnter={() => onDragEnter(section.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, section.id)}
    >
      <div
        className={`column-header ${canEdit ? "is-section-draggable" : ""} ${
          draggingSectionId === section.id ? "is-section-dragging" : ""
        }`}
        draggable={canEdit}
        onDragStart={(e) => {
          if (!canEdit) return;
          e.dataTransfer.setData("application/section-id", section.id);
          e.dataTransfer.effectAllowed = "move";
          onSectionDragStart(section.id);
        }}
        onDragEnd={onSectionDragEnd}
      >
        <h3 className="column-title">{section.title}</h3>
        <span className="column-count">{sectionCards.length}</span>
        {(canEdit || menuItems.length > 0) && (
          <ColumnMenu
            sortMode={sortMode}
            canSort={canEdit}
            onSetSort={onSetSort}
            actions={menuItems}
          />
        )}
      </div>
      <div
        className={`column-cards ${
          overSectionId === section.id ? "column-cards-active" : ""
        }`}
      >
        {sectionCards.map((c) => {
          const canModify =
            currentRole === "owner" ||
            (currentRole === "editor" && c.authorId === currentUserId) ||
            c.studentAuthorId === currentUserId;

          return (
            <article
              key={c.id}
              className="column-card is-clickable"
              style={{ backgroundColor: c.color ?? undefined }}
              draggable={canEdit}
              onDragStart={(e) => onCardDragStart(e, c.id)}
              onDragEnd={onCardDragEnd}
              onClick={() => onCardOpen(c)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onCardOpen(c);
                }
              }}
              tabIndex={0}
              role="button"
            >
              <CardBody card={c} titleAs="h4" />
              {canModify && (
                <div
                  className="card-ctx-menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ContextMenu
                    items={[
                      {
                        label: "수정",
                        icon: "✏️",
                        onClick: () => onCardEdit(c),
                      },
                      ...(canEdit || c.studentAuthorId === currentUserId
                        ? [
                            {
                              label: "작성자 지정",
                              icon: "👥",
                              onClick: () => onCardEditAuthors(c),
                            },
                          ]
                        : []),
                      {
                        label: "복제",
                        icon: "📋",
                        onClick: () => onCardDuplicate(c),
                      },
                      {
                        label: "삭제",
                        icon: "🗑️",
                        danger: true,
                        onClick: () => onCardDelete(c.id),
                      },
                    ]}
                  />
                </div>
              )}
            </article>
          );
        })}
        {sectionCards.length === 0 && (
          <div className="column-empty">카드를 여기로 끌어오세요</div>
        )}
      </div>
      {canEdit && (
        <button
          type="button"
          className="column-inline-add"
          onClick={onAddInColumn}
        >
          + 카드 추가
        </button>
      )}
    </div>
  );
}
