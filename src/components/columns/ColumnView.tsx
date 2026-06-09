"use client";

import { useEffect, useRef } from "react";
import type { CardData } from "../DraggableCard";
import { CardBody } from "../cards/CardBody";
import { ContextMenu } from "../ContextMenu";
import { ColumnMenu } from "./ColumnMenu";
import type { SortMode } from "./sort";
import type { RosterEntry } from "./useColumnRoster";

type CardDropPreview = {
  sectionId: string;
  cardId: string;
  position: "before" | "after";
  placeholderHeight: number;
} | null;

type Props = {
  section: { id: string; title: string };
  pinned: boolean;
  sectionCards: CardData[];
  canEdit: boolean;
  currentRole: "owner" | "editor" | "viewer";
  currentUserId: string;
  classroomId?: string | null;
  sortMode: SortMode;
  overSectionId: string | null;
  draggingSectionId: string | null;
  cardDropPreview: CardDropPreview;
  organizing: string | null;
  authorsForSection: (cards: CardData[]) => RosterEntry[];
  studentForSectionTitle: (title: string) => RosterEntry | null;
  onSetSort: (mode: SortMode) => void | Promise<void>;
  onPin: (pinned: boolean) => void;
  onSectionDragStart: (id: string) => void;
  onSectionDragEnd: () => void;
  onCardDragStart: (e: React.DragEvent, cardId: string) => void;
  onCardDragEnd: (e: React.DragEvent) => void;
  onCardDropReorder: (
    cardId: string,
    targetCardId: string,
    sectionId: string,
    dropPosition: "before" | "after",
    visibleCardIds?: string[],
  ) => void | Promise<void>;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (id: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetId: string) => void;
  onCardDropPreview: (preview: CardDropPreview) => void;
  onClearCardDropPreview: () => void;
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
  onAddInColumn?: () => void;
};

export function ColumnView(props: Props) {
  const {
    section,
    pinned,
    sectionCards,
    canEdit,
    currentRole,
    currentUserId,
    classroomId,
    sortMode,
    overSectionId,
    draggingSectionId,
    cardDropPreview,
    organizing,
    authorsForSection,
    studentForSectionTitle,
    onSetSort,
    onPin,
    onSectionDragStart,
    onSectionDragEnd,
    onCardDragStart,
    onCardDragEnd,
    onCardDropReorder,
    onDragOver,
    onDragEnter,
    onDragLeave,
    onDrop,
    onCardDropPreview,
    onClearCardDropPreview,
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
      (c.linkUrl.includes("canva.link") || c.linkUrl.includes("canva.com")),
  );

  const sectionStudent = canEdit ? studentForSectionTitle(section.title) : null;

  const menuItems = canEdit ? buildMenuItems() : [];
  const isDropSection = overSectionId === section.id;

  // Throttle drag-preview updates: only call onCardDropPreview when the
  // hover target actually changes, not on every onDragOver pixel-event.
  // This prevents redundant re-renders that kill the gap CSS transition.
  const lastPreviewRef = useRef<CardDropPreview>(null);
  const autoScrollRef = useRef<{
    el: HTMLElement | null;
    frame: number | null;
    pointerY: number;
  }>({ el: null, frame: null, pointerY: 0 });

  useEffect(() => stopColumnAutoScroll, []);

  function getDragPlaceholderHeight(e: React.DragEvent, fallback: number) {
    const raw = e.dataTransfer.getData("application/card-height");
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function startColumnAutoScroll(el: HTMLElement, pointerY: number) {
    autoScrollRef.current.el = el;
    autoScrollRef.current.pointerY = pointerY;
    if (autoScrollRef.current.frame !== null) return;

    const tick = () => {
      const state = autoScrollRef.current;
      const scrollEl = state.el;
      if (!scrollEl) {
        state.frame = null;
        return;
      }

      const rect = scrollEl.getBoundingClientRect();
      const y = state.pointerY - rect.top;
      const threshold = 72;
      let delta = 0;
      if (y < threshold) {
        delta = -Math.ceil(((threshold - y) / threshold) * 18);
      } else if (y > rect.height - threshold) {
        delta = Math.ceil(((y - (rect.height - threshold)) / threshold) * 18);
      }

      if (delta !== 0) scrollEl.scrollTop += delta;
      state.frame = requestAnimationFrame(tick);
    };

    autoScrollRef.current.frame = requestAnimationFrame(tick);
  }

  function stopColumnAutoScroll() {
    const frame = autoScrollRef.current.frame;
    if (frame !== null) cancelAnimationFrame(frame);
    autoScrollRef.current = { el: null, frame: null, pointerY: 0 };
  }

  function buildMenuItems() {
    const items: Array<{
      label: string;
      icon: string;
      onClick: () => void;
      danger?: boolean;
    }> = [{ label: "이름 변경", icon: "✏️", onClick: onRename }];

    if (classroomId) {
      const sectionAuthors = authorsForSection(sectionCards);
      const seedRow = sectionStudent
        ? (sectionAuthors.find((s) => s.id === sectionStudent.id) ?? {
            id: sectionStudent.id,
            name: sectionStudent.name,
            number: sectionStudent.number,
          })
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
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          stopColumnAutoScroll();
        }
        onDragLeave(e);
      }}
      onDrop={(e) => {
        stopColumnAutoScroll();
        onDrop(e, section.id);
      }}
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
        {canEdit && (
          <button
            type="button"
            className={`column-pin-btn ${pinned ? "is-pinned" : ""}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onPin(!pinned);
            }}
            onDragStart={(e) => e.preventDefault()}
            aria-pressed={pinned}
            aria-label={pinned ? "섹션 고정 해제" : "섹션 고정"}
            title={pinned ? "고정해제" : "고정"}
          >
            {pinned ? "📌 고정해제" : "📌 고정"}
          </button>
        )}
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
      {onAddInColumn && (
        <button
          type="button"
          className="column-inline-add"
          onClick={onAddInColumn}
        >
          + 카드 추가
        </button>
      )}
      <div
        className="column-cards-scroll"
        onDragOver={(e) => {
          const draggedId = e.dataTransfer.getData("application/card-id");
          if (!draggedId) return;
          startColumnAutoScroll(e.currentTarget, e.clientY);
        }}
      >
        <div
          className={`column-cards ${
            isDropSection ? "column-cards-active" : ""
          }`}
        >
          {sectionCards.map((c) => {
            const canModify =
              currentRole === "owner" ||
              (currentRole === "editor" && c.authorId === currentUserId) ||
              c.studentAuthorId === currentUserId;
            const isPreviewTarget =
              cardDropPreview?.sectionId === section.id &&
              cardDropPreview.cardId === c.id;
            const beforeHeight =
              isPreviewTarget && cardDropPreview.position === "before"
                ? cardDropPreview.placeholderHeight
                : 0;
            const afterHeight =
              isPreviewTarget && cardDropPreview.position === "after"
                ? cardDropPreview.placeholderHeight
                : 0;

            return (
              <div
                key={c.id}
                className={`column-card-drop-wrap${
                  cardDropPreview?.sectionId === section.id &&
                  cardDropPreview.cardId === c.id
                    ? cardDropPreview.position === "before"
                      ? " is-gap-before"
                      : " is-gap-after"
                    : ""
                }`}
              >
                <div
                  className="column-card-drop-placeholder"
                  style={{ height: beforeHeight }}
                  aria-hidden="true"
                >
                  {beforeHeight > 0 && <DropIndicator sortMode={sortMode} />}
                </div>
                <article
                  data-column-card-id={c.id}
                  className={`column-card is-clickable ${
                    cardDropPreview?.sectionId === section.id &&
                    cardDropPreview.cardId === c.id
                      ? `is-drop-preview is-drop-preview-${cardDropPreview.position}`
                      : ""
                  }`}
                  style={{ backgroundColor: c.color ?? undefined }}
                  draggable={canEdit}
                  onDragStart={(e) => onCardDragStart(e, c.id)}
                  onDragEnd={(e) => {
                    stopColumnAutoScroll();
                    onCardDragEnd(e);
                  }}
                  onDragOver={(e) => {
                    if (!canEdit) return;
                    e.preventDefault();
                    const draggedId = e.dataTransfer.getData(
                      "application/card-id",
                    );
                    const scrollEl = e.currentTarget.closest(
                      ".column-cards-scroll",
                    ) as HTMLElement | null;
                    if (scrollEl) {
                      startColumnAutoScroll(scrollEl, e.clientY);
                    }
                    if (!draggedId || draggedId === c.id) {
                      onClearCardDropPreview();
                      lastPreviewRef.current = null;
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const newPreview: CardDropPreview = {
                      sectionId: section.id,
                      cardId: c.id,
                      position: y < rect.height / 2 ? "before" : "after",
                      placeholderHeight: getDragPlaceholderHeight(
                        e,
                        rect.height,
                      ),
                    };
                    // Only update parent state when preview target actually
                    // changes — avoids constant re-renders during drag.
                    const last = lastPreviewRef.current;
                    if (
                      !last ||
                      last.sectionId !== newPreview.sectionId ||
                      last.cardId !== newPreview.cardId ||
                      last.position !== newPreview.position ||
                      last.placeholderHeight !== newPreview.placeholderHeight
                    ) {
                      lastPreviewRef.current = newPreview;
                      onCardDropPreview(newPreview);
                    }
                  }}
                  onDrop={async (e) => {
                    if (!canEdit) return;
                    e.preventDefault();
                    e.stopPropagation();
                    stopColumnAutoScroll();
                    const draggedId = e.dataTransfer.getData(
                      "application/card-id",
                    );
                    if (!draggedId || draggedId === c.id) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const position = y < rect.height / 2 ? "before" : "after";
                    onClearCardDropPreview();
                    if (sortMode !== "manual") {
                      await onSetSort("manual");
                    }
                    await onCardDropReorder(
                      draggedId,
                      c.id,
                      section.id,
                      position,
                      sectionCards.map((card) => card.id),
                    );
                  }}
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
                <div
                  className="column-card-drop-placeholder"
                  style={{ height: afterHeight }}
                  aria-hidden="true"
                >
                  {afterHeight > 0 && <DropIndicator sortMode={sortMode} />}
                </div>
              </div>
            );
          })}
          {sectionCards.length === 0 && (
            <div
              className={`column-empty ${isDropSection ? "is-drop-target" : ""}`}
            >
              {isDropSection ? "여기에 놓기" : "카드를 여기로 끌어오세요"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DropIndicator({ sortMode }: { sortMode: SortMode }) {
  return (
    <div className="column-drop-indicator" aria-hidden="true">
      <span className="column-drop-indicator-line" />
      {sortMode !== "manual" && (
        <span className="column-drop-indicator-label">수동 정렬로 전환</span>
      )}
    </div>
  );
}
