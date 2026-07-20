"use client";

import type { ComponentProps, DragEvent, RefObject } from "react";
import type { CardData } from "../DraggableCard";
import {
  ColumnView,
  type ColumnAssignmentAction,
  type ColumnAssignmentState,
} from "./ColumnView";
import { ColumnsRealtimeStatus } from "./ColumnsRealtimeStatus";
import type { SortMode } from "./sort";
import type { RosterEntry } from "./useColumnRoster";
import type {
  ColumnsCardDropPreview,
  ColumnsSection,
} from "./columns-board-types";

type RealtimeProps = ComponentProps<typeof ColumnsRealtimeStatus>;

export type ColumnsBoardCanvasProps = {
  realtime: RealtimeProps;
  scrollAreaRef: RefObject<HTMLDivElement | null>;
  columnsBoardRef: RefObject<HTMLDivElement | null>;
  scrollBarRef: RefObject<HTMLDivElement | null>;
  scrollRailWidth: number;
  sortedSections: ColumnsSection[];
  sortModeById: Record<string, SortMode>;
  getCardsForSection: (sectionId: string) => CardData[];
  boardId: string;
  canEdit: boolean;
  canAddCard: boolean;
  currentRole: "owner" | "editor" | "viewer";
  currentUserId: string;
  classroomId?: string | null;
  overSectionId: string | null;
  draggingSectionId: string | null;
  cardDropPreview: ColumnsCardDropPreview;
  organizing: string | null;
  assignmentBusySectionId: string | null;
  roster: RosterEntry[];
  authorsForSection: (cards: CardData[]) => RosterEntry[];
  studentForSectionTitle: (title: string) => RosterEntry | null;
  onSetSort: (sectionId: string, mode: SortMode) => void | Promise<void>;
  onAssignmentAction: (
    sectionId: string,
    action: ColumnAssignmentAction,
  ) => void | Promise<void>;
  onPin: (sectionId: string, pinned: boolean) => void;
  onSectionDragStart: (id: string) => void;
  onSectionDragEnd: () => void;
  onCardDragStart: (event: DragEvent, cardId: string) => void;
  onCardDragEnd: (event: DragEvent) => void;
  onCardDropReorder: (
    cardId: string,
    targetCardId: string,
    sectionId: string,
    dropPosition: "before" | "after",
    visibleCardIds?: string[],
  ) => void | Promise<void>;
  onDragOver: (event: DragEvent) => void;
  onDragEnter: (id: string) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent, targetSectionId: string) => void;
  onCardDropPreview: (preview: ColumnsCardDropPreview) => void;
  onClearCardDropPreview: () => void;
  onRename: (sectionId: string) => void;
  onDelete: (sectionId: string) => void;
  onFolder: (sectionId: string) => void;
  onExport: (sectionId: string) => void;
  onOrganize: (sectionId: string) => void;
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
  onAddInColumn: (sectionId: string) => void;
  onAddSection: () => void;
  onSeedStudents: () => void;
  seedingStudents: boolean;
};

export function ColumnsBoardCanvas({
  realtime,
  scrollAreaRef,
  columnsBoardRef,
  scrollBarRef,
  scrollRailWidth,
  sortedSections,
  sortModeById,
  getCardsForSection,
  boardId,
  canEdit,
  canAddCard,
  currentRole,
  currentUserId,
  classroomId,
  overSectionId,
  draggingSectionId,
  cardDropPreview,
  organizing,
  assignmentBusySectionId,
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
  onAddSection,
  onSeedStudents,
  seedingStudents,
}: ColumnsBoardCanvasProps) {
  return (
    <>
      <ColumnsRealtimeStatus {...realtime} />
      <div ref={scrollAreaRef} className="columns-scroll-area">
        <div ref={columnsBoardRef} className="columns-board">
          {sortedSections.map((section) => (
            <ColumnView
              key={section.id}
              section={{ id: section.id, title: section.title }}
              pinned={section.pinned}
              sectionCards={getCardsForSection(section.id)}
              boardId={boardId}
              canEdit={canEdit}
              currentRole={currentRole}
              currentUserId={currentUserId}
              classroomId={classroomId}
              sortMode={sortModeById[section.id] ?? "manual"}
              overSectionId={overSectionId}
              draggingSectionId={draggingSectionId}
              cardDropPreview={cardDropPreview}
              organizing={organizing}
              assignmentState={
                getAssignmentState(
                  section,
                  assignmentBusySectionId === section.id,
                )
              }
              roster={roster}
              authorsForSection={authorsForSection}
              studentForSectionTitle={studentForSectionTitle}
              onSetSort={(mode) => onSetSort(section.id, mode)}
              onAssignmentAction={(action) =>
                onAssignmentAction(section.id, action)
              }
              onPin={(pinned) => onPin(section.id, pinned)}
              onSectionDragStart={onSectionDragStart}
              onSectionDragEnd={onSectionDragEnd}
              onCardDragStart={onCardDragStart}
              onCardDragEnd={onCardDragEnd}
              onCardDropReorder={onCardDropReorder}
              onDragOver={onDragOver}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onCardDropPreview={onCardDropPreview}
              onClearCardDropPreview={onClearCardDropPreview}
              onRename={() => onRename(section.id)}
              onDelete={() => onDelete(section.id)}
              onFolder={() => onFolder(section.id)}
              onExport={() => onExport(section.id)}
              onOrganize={() => onOrganize(section.id)}
              onFeedback={onFeedback}
              onCardOpen={onCardOpen}
              onCardEdit={onCardEdit}
              onCardEditAuthors={onCardEditAuthors}
              onCardDuplicate={onCardDuplicate}
              onCardDelete={onCardDelete}
              onCardToggleGuide={onCardToggleGuide}
              onAddInColumn={
                canAddCard ? () => onAddInColumn(section.id) : undefined
              }
            />
          ))}

          {canEdit && (
            <div className="column-add-stack">
              <button
                type="button"
                className="column-add-btn"
                onClick={onAddSection}
              >
                + 섹션 추가
              </button>
              {classroomId && (
                <button
                  type="button"
                  className="column-add-btn column-add-btn-seed"
                  onClick={onSeedStudents}
                  disabled={seedingStudents}
                  title="학급 학생 명단으로 섹션을 한 번에 추가"
                >
                  {seedingStudents
                    ? "추가 중…"
                    : "🧑 학생 이름으로 섹션 추가"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div
        ref={scrollBarRef}
        className={`columns-scrollbar ${scrollRailWidth > 0 ? "is-visible" : ""}`}
        aria-hidden="true"
      >
        <div
          className="columns-scrollbar-rail"
          style={{ width: scrollRailWidth }}
        />
      </div>
    </>
  );
}

function getAssignmentState(
  section: ColumnsSection,
  pending: boolean,
): ColumnAssignmentState {
  return {
    distributed: Boolean(section.assignmentPublishedAt),
    distributedAt: section.assignmentPublishedAt ?? null,
    reminderSentAt: section.assignmentReminderSentAt ?? null,
    pending,
  };
}
