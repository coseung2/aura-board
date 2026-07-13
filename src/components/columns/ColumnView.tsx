"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { CardData } from "../DraggableCard";
import { CardBody } from "../cards/CardBody";
import { ContextMenu } from "../ContextMenu";
import { ColumnMenu } from "./ColumnMenu";
import { CanvaAttribution } from "../canva/CanvaAttribution";
import type { SortMode } from "./sort";
import type { RosterEntry } from "./useColumnRoster";

export type ColumnAssignmentAction = "distribute" | "remind";

export type ColumnAssignmentState = {
  distributed: boolean;
  distributedAt: string | null;
  reminderSentAt: string | null;
  pending: boolean;
};

type CardDropPreview = {
  sectionId: string;
  draggedCardId: string;
  cardId: string;
  position: "before" | "after";
  placeholderHeight: number;
} | null;

type Props = {
  section: {
    id: string;
    title: string;
  };
  pinned: boolean;
  sectionCards: CardData[];
  boardId?: string;
  canEdit: boolean;
  currentRole: "owner" | "editor" | "viewer";
  currentUserId: string;
  classroomId?: string | null;
  sortMode: SortMode;
  overSectionId: string | null;
  draggingSectionId: string | null;
  cardDropPreview: CardDropPreview;
  organizing: string | null;
  assignmentState?: ColumnAssignmentState;
  roster: RosterEntry[];
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
  onAssignmentAction?: (action: ColumnAssignmentAction) => void | Promise<void>;
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
  onCardToggleGuide: (card: CardData, guidePinned: boolean) => void;
  onAddInColumn?: () => void;
};

export function ColumnView(props: Props) {
  const {
    section,
    pinned,
    sectionCards,
    boardId,
    canEdit,
    currentRole,
    currentUserId,
    classroomId,
    sortMode,
    overSectionId,
    draggingSectionId,
    cardDropPreview,
    organizing,
    assignmentState,
    roster,
    authorsForSection,
    studentForSectionTitle,
    onSetSort,
    onAssignmentAction,
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
    onCardToggleGuide,
    onAddInColumn,
  } = props;

  const hasCanva = sectionCards.some(
    (c) =>
      c.linkUrl &&
      (c.linkUrl.includes("canva.link") || c.linkUrl.includes("canva.com")),
  );

  const sectionStudent = canEdit ? studentForSectionTitle(section.title) : null;

  const isDropSection = overSectionId === section.id;
  const assignmentDistributed = assignmentState?.distributed ?? false;
  const assignmentAction: ColumnAssignmentAction = assignmentDistributed
    ? "remind"
    : "distribute";
  const assignmentBadgeTitle = formatAssignmentBadgeTitle(assignmentState);
  const menuItems = canEdit ? buildMenuItems() : [];
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);
  const submittedStudents = authorsForSection(sectionCards);
  const submittedIds = new Set(submittedStudents.map((student) => student.id));
  const missingStudents = roster
    .filter((student) => !submittedIds.has(student.id))
    .sort(compareRosterEntries);
  const submissionCount =
    roster.length > 0 ? submittedStudents.length : sectionCards.length;

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

  useEffect(() => {
    if (!submissionModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSubmissionModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [submissionModalOpen]);

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

  function getCardRects() {
    const rects = new Map<string, DOMRect>();
    document
      .querySelectorAll<HTMLElement>("[data-column-card-id]")
      .forEach((el) => {
        const id = el.dataset.columnCardId;
        if (id) rects.set(id, el.getBoundingClientRect());
      });
    return rects;
  }

  function animatePreviewChange(preview: CardDropPreview) {
    const before = getCardRects();
    flushSync(() => onCardDropPreview(preview));

    requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduceMotion) return;

      document
        .querySelectorAll<HTMLElement>("[data-column-card-id]")
        .forEach((el) => {
          const id = el.dataset.columnCardId;
          const first = id ? before.get(id) : null;
          if (!first) return;

          const last = el.getBoundingClientRect();
          const dx = first.left - last.left;
          const dy = first.top - last.top;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

          el.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: "translate(0, 0)" },
            ],
            {
              duration: 180,
              easing: "cubic-bezier(0.2, 0, 0, 1)",
            },
          );
        });
    });
  }

  function getPreviewCards() {
    if (
      !cardDropPreview ||
      cardDropPreview.sectionId !== section.id ||
      cardDropPreview.draggedCardId === cardDropPreview.cardId
    ) {
      return sectionCards;
    }

    const dragged = sectionCards.find(
      (card) => card.id === cardDropPreview.draggedCardId,
    );
    if (!dragged) return sectionCards;

    const withoutDragged = sectionCards.filter((card) => card.id !== dragged.id);
    const targetIndex = withoutDragged.findIndex(
      (card) => card.id === cardDropPreview.cardId,
    );
    if (targetIndex === -1) return sectionCards;

    const insertAt =
      cardDropPreview.position === "after" ? targetIndex + 1 : targetIndex;
    const next = [...withoutDragged];
    next.splice(insertAt, 0, dragged);
    return next;
  }

  function buildMenuItems() {
    const items: Array<{
      label: string;
      icon: string;
      onClick: () => void;
      danger?: boolean;
    }> = [{ label: "이름 변경", icon: "✏️", onClick: onRename }];

    if (classroomId) {
      if (onAssignmentAction) {
        items.push({
          label: assignmentState?.pending
            ? "처리 중..."
            : assignmentDistributed
              ? "제출 알림"
              : "과제 배부",
          icon: assignmentDistributed ? "🔔" : "📣",
          onClick: () => {
            if (assignmentState?.pending) return;
            void onAssignmentAction(assignmentAction);
          },
        });
      }

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

    items.push({
      label: "PDF 내보내기",
      icon: "📄",
      onClick: onExport,
    });

    if (hasCanva) {
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
    <>
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
        {assignmentDistributed && (
          <span className="column-assignment-badge" title={assignmentBadgeTitle}>
            과제 배부됨
          </span>
        )}
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
            📌
          </button>
        )}
        <button
          type="button"
          className="column-count column-count-button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setSubmissionModalOpen(true);
          }}
          onDragStart={(e) => e.preventDefault()}
          aria-label={`${section.title} 제출 현황 보기`}
          title="제출 현황"
        >
          {submissionCount}
        </button>
        {(canEdit || menuItems.length > 0) && (
          <ColumnMenu
            sortMode={sortMode}
            canSort={canEdit}
            onSetSort={onSetSort}
            actions={menuItems}
            footer={<CanvaAttribution />}
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
          {getPreviewCards().map((c) => {
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
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const newPreview: CardDropPreview = {
                      sectionId: section.id,
                      draggedCardId: draggedId,
                      cardId: c.id,
                      position: y < rect.height / 2 ? "before" : "after",
                      placeholderHeight: 22,
                    };
                    // Only update parent state when preview target actually
                    // changes — avoids constant re-renders during drag.
                    const last = lastPreviewRef.current;
                    if (
                      !last ||
                      last.sectionId !== newPreview.sectionId ||
                      last.draggedCardId !== newPreview.draggedCardId ||
                      last.cardId !== newPreview.cardId ||
                      last.position !== newPreview.position ||
                      last.placeholderHeight !== newPreview.placeholderHeight
                    ) {
                      lastPreviewRef.current = newPreview;
                      animatePreviewChange(newPreview);
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
                  <CardBody
                    card={c}
                    titleAs="h4"
                    boardId={boardId}
                    onEditAuthors={
                      canEdit || c.studentAuthorId === currentUserId
                        ? () => onCardEditAuthors(c)
                        : undefined
                    }
                  />
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
                          ...(canEdit && !!c.authorId && !c.studentAuthorId
                            ? [
                                {
                                  label: c.guidePinned ? "가이드 해제" : "가이드 고정",
                                  icon: "📌",
                                  onClick: () => onCardToggleGuide(c, !c.guidePinned),
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
      {submissionModalOpen &&
        createPortal(
          <SubmissionStatusModal
            sectionTitle={section.title}
            submitted={submittedStudents}
            missing={missingStudents}
            rosterCount={roster.length}
            fallbackCount={sectionCards.length}
            onClose={() => setSubmissionModalOpen(false)}
          />,
          document.body,
        )}
    </>
  );
}

function compareRosterEntries(a: RosterEntry, b: RosterEntry) {
  if (a.number == null && b.number == null) {
    return a.name.localeCompare(b.name, "ko");
  }
  if (a.number == null) return 1;
  if (b.number == null) return -1;
  return a.number - b.number;
}

function formatRosterName(student: RosterEntry) {
  return student.number == null
    ? student.name
    : `${student.number}번 ${student.name}`;
}

function formatAssignmentBadgeTitle(state?: ColumnAssignmentState) {
  if (!state?.distributed) return "아직 배부되지 않은 과제";
  const distributedAt = formatAssignmentDate(state.distributedAt);
  const reminderSentAt = formatAssignmentDate(state.reminderSentAt);
  if (reminderSentAt) return `과제 배부됨 · 최근 알림 ${reminderSentAt}`;
  if (distributedAt) return `과제 배부됨 · ${distributedAt}`;
  return "과제 배부됨";
}

function formatAssignmentDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SubmissionStatusModal({
  sectionTitle,
  submitted,
  missing,
  rosterCount,
  fallbackCount,
  onClose,
}: {
  sectionTitle: string;
  submitted: RosterEntry[];
  missing: RosterEntry[];
  rosterCount: number;
  fallbackCount: number;
  onClose: () => void;
}) {
  const hasRoster = rosterCount > 0;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="column-submission-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${sectionTitle} 제출 현황`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="column-submission-eyebrow">{sectionTitle}</p>
            <h2 className="modal-title">제출 현황</h2>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="닫기"
          />
        </div>
        <div className="column-submission-modal-body">
          <div className="column-submission-summary">
            <span className="column-submission-summary-chip">
              제출 {submitted.length}
            </span>
            {hasRoster ? (
              <>
                <span className="column-submission-summary-chip">
                  미제출 {missing.length}
                </span>
                <span className="column-submission-summary-chip">
                  전체 {rosterCount}
                </span>
              </>
            ) : (
              <span className="column-submission-summary-chip">
                카드 {fallbackCount}
              </span>
            )}
          </div>
          {!hasRoster && (
            <p className="column-submission-note">
              학급이 연결되지 않은 보드예요. 학생별 제출자/미제출자 현황 대신 이 섹션의 카드 수를 표시합니다.
            </p>
          )}

          <SubmissionList title="제출자" people={submitted} empty="제출자 없음" />
          {hasRoster && (
            <SubmissionList
              title="미제출자"
              people={missing}
              empty="미제출자 없음"
            />
          )}
        </div>
      </section>
    </div>
  );
}

function SubmissionList({
  title,
  people,
  empty,
}: {
  title: string;
  people: RosterEntry[];
  empty: string;
}) {
  return (
    <section className="column-submission-group">
      <h3 className="column-submission-group-title">{title}</h3>
      {people.length > 0 ? (
        <div className="column-submission-list">
          {people.map((person) => (
            <div className="column-submission-person" key={person.id}>
              {formatRosterName(person)}
            </div>
          ))}
        </div>
      ) : (
        <p className="column-submission-empty">{empty}</p>
      )}
    </section>
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
