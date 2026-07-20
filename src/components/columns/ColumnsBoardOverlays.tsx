"use client";

import { AddCardButton } from "../AddCardButton";
import { AddCardModal, type AddCardData } from "../AddCardModal";
import { CardDetailModal } from "../cards/CardDetailModal";
import { CardAuthorEditor, type SavedAuthor } from "../cards/CardAuthorEditor";
import { EditCardModal, type EditCardUpdates } from "../EditCardModal";
import { ExportModal } from "../ExportModal";
import { CanvaFolderModal } from "../CanvaFolderModal";
import { SectionActionsPanel } from "../SectionActionsPanel";
import { AiFeedbackModal } from "../feedback/AiFeedbackModal";
import { SeedStudentsDialog } from "./SeedStudentsDialog";
import type { CardData } from "../DraggableCard";
import type { SubjectOrder } from "@/lib/subject-order";
import { normalizeSubjectOrder } from "@/lib/subject-order";
import type {
  ColumnsFeedbackTarget,
  ColumnsPanelState,
  ColumnsSection,
} from "./columns-board-types";

type SectionOption = { id: string; title: string };

export type ColumnsBoardOverlaysProps = {
  boardId: string;
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  isStudentViewer?: boolean;
  classroomId?: string | null;
  classroomStudentCount: number | null;
  boardSubjectOrder?: SubjectOrder | null;
  canEdit: boolean;
  canAddCard: boolean;
  sections: ColumnsSection[];
  sectionOptions: SectionOption[];
  onAdd: (data: AddCardData) => Promise<void>;
  onEditCardSave: (
    editingCard: CardData | null,
    updates: EditCardUpdates,
  ) => Promise<void>;
  onAuthorSaved: (cardId: string, authors: SavedAuthor[]) => void;
  onSeedConfirm: (order: SubjectOrder) => Promise<void>;
  addForSection: string | null;
  onCloseAdd: () => void;
  editingCard: CardData | null;
  onCloseEditing: () => void;
  authorEditCard: CardData | null;
  onCloseAuthorEdit: () => void;
  openCard: CardData | null;
  onCloseCard: () => void;
  hasPreviousCard: boolean;
  hasNextCard: boolean;
  onPreviousCard?: () => void;
  onNextCard?: () => void;
  onEditAuthors: (card: CardData) => void;
  canEditAuthors: (card: CardData) => boolean;
  panelState: ColumnsPanelState | null;
  onClosePanel: () => void;
  onRenameSection: (sectionId: string, title: string) => void;
  onDeleteSection: (sectionId: string) => void;
  folderSectionId: string | null;
  onImportFromCanva: (
    designs: { id: string; title: string; thumbnail?: string }[],
  ) => void | Promise<void>;
  onCloseFolder: () => void;
  exportSectionId: string | null;
  onCloseExport: () => void;
  getCardsForSection: (sectionId: string) => CardData[];
  feedbackTarget: ColumnsFeedbackTarget | null;
  onCloseFeedback: () => void;
  seedDialogOpen: boolean;
  seedingStudents: boolean;
  seedDialogError: string | null;
  onCloseSeedDialog: () => void;
};

/**
 * Modal and floating actions for the columns board live together so the board
 * canvas can stay focused on section/card interaction and realtime state.
 */
export function ColumnsBoardOverlays({
  boardId,
  currentUserId,
  currentRole,
  isStudentViewer,
  classroomId,
  classroomStudentCount,
  boardSubjectOrder,
  canEdit,
  canAddCard,
  sections,
  sectionOptions,
  onAdd,
  onEditCardSave,
  onAuthorSaved,
  onSeedConfirm,
  addForSection,
  onCloseAdd,
  editingCard,
  onCloseEditing,
  authorEditCard,
  onCloseAuthorEdit,
  openCard,
  onCloseCard,
  hasPreviousCard,
  hasNextCard,
  onPreviousCard,
  onNextCard,
  onEditAuthors,
  canEditAuthors,
  panelState,
  onClosePanel,
  onRenameSection,
  onDeleteSection,
  folderSectionId,
  onImportFromCanva,
  onCloseFolder,
  exportSectionId,
  onCloseExport,
  getCardsForSection,
  feedbackTarget,
  onCloseFeedback,
  seedDialogOpen,
  seedingStudents,
  seedDialogError,
  onCloseSeedDialog,
}: ColumnsBoardOverlaysProps) {
  const panelSection = panelState
    ? sections.find((section) => section.id === panelState.sectionId)
    : null;
  const folderSection = folderSectionId
    ? sections.find((section) => section.id === folderSectionId)
    : null;
  const exportSection = exportSectionId
    ? sections.find((section) => section.id === exportSectionId)
    : null;

  return (
    <>
      {canAddCard && (
        <AddCardButton
          onAdd={onAdd}
          sections={sectionOptions}
          canAssignAuthors={canEdit}
          canConfigurePoll={canEdit || !!isStudentViewer}
          classroomId={classroomId}
        />
      )}

      {addForSection && (
        <AddCardModal
          onAdd={onAdd}
          onClose={onCloseAdd}
          sections={sectionOptions}
          defaultSectionId={addForSection}
          canAssignAuthors={canEdit}
          canConfigurePoll={canEdit || !!isStudentViewer}
          classroomId={classroomId}
        />
      )}

      {editingCard && (
        <EditCardModal
          card={editingCard}
          onSave={(updates) => onEditCardSave(editingCard, updates)}
          onClose={onCloseEditing}
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
          initialAuthors={(authorEditCard.authors ?? []).map((author) => ({
            id: author.id,
            studentId: author.studentId,
            displayName: author.displayName,
            order: author.order,
          }))}
          onSaved={(authors: SavedAuthor[]) =>
            onAuthorSaved(authorEditCard.id, authors)
          }
          onClose={onCloseAuthorEdit}
        />
      )}

      <CardDetailModal
        card={openCard}
        onClose={onCloseCard}
        hasPrevious={hasPreviousCard}
        hasNext={hasNextCard}
        onPrevious={onPreviousCard}
        onNext={onNextCard}
        onEditAuthors={onEditAuthors}
        canEditAuthors={canEditAuthors}
        boardId={boardId}
        isStudentViewer={isStudentViewer}
      />

      {panelSection && panelState && (
        <SectionActionsPanel
          open={true}
          onClose={onClosePanel}
          section={{ id: panelSection.id, title: panelSection.title }}
          currentRole={currentRole}
          defaultTab={panelState.tab}
          onRenamed={(title) => onRenameSection(panelSection.id, title)}
          onDeleted={() => onDeleteSection(panelSection.id)}
        />
      )}

      {folderSection && (
        <CanvaFolderModal
          sectionTitle={folderSection.title}
          onImport={onImportFromCanva}
          onClose={onCloseFolder}
        />
      )}

      {exportSection && (
        <ExportModal
          sectionTitle={exportSection.title}
          cards={getCardsForSection(exportSection.id)}
          onClose={onCloseExport}
        />
      )}

      {feedbackTarget && (
        <AiFeedbackModal
          studentId={feedbackTarget.studentId}
          studentName={feedbackTarget.name}
          studentNumber={feedbackTarget.number}
          roster={feedbackTarget.roster}
          sectionId={feedbackTarget.sectionId}
          onClose={onCloseFeedback}
        />
      )}

      {classroomId && (
        <SeedStudentsDialog
          open={seedDialogOpen && canEdit}
          studentCount={classroomStudentCount}
          defaultOrder={normalizeSubjectOrder(
            boardSubjectOrder ??
              sections.find((section) => section.pinned)?.order ??
              "asc",
          )}
          busy={seedingStudents}
          errorMessage={seedDialogError}
          onClose={onCloseSeedDialog}
          onConfirm={onSeedConfirm}
        />
      )}
    </>
  );
}
