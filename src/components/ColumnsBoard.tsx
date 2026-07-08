"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddCardButton } from "./AddCardButton";
import { AddCardModal, type AddCardData } from "./AddCardModal";
import { CardDetailModal } from "./cards/CardDetailModal";
import { CardAuthorEditor, type SavedAuthor } from "./cards/CardAuthorEditor";
import { EditCardModal, type EditCardUpdates } from "./EditCardModal";
import { ExportModal } from "./ExportModal";
import { CanvaFolderModal } from "./CanvaFolderModal";
import { SectionActionsPanel } from "./SectionActionsPanel";
import { AiFeedbackModal } from "./feedback/AiFeedbackModal";
import {
  ColumnView,
  type ColumnAssignmentAction,
  type ColumnAssignmentState,
} from "./columns/ColumnView";
import { SeedStudentsDialog } from "./columns/SeedStudentsDialog";
import { comparatorFor, toSortMode, type SortMode } from "./columns/sort";
import { useBoardStream, type StreamSection } from "./columns/useBoardStream";
import { useBoardAnonymityChange } from "@/hooks/useBoardAnonymityChange";
import { useColumnRoster, type RosterEntry } from "./columns/useColumnRoster";
import { useCardMutations } from "./columns/useCardMutations";
import { useSectionMutations } from "./columns/useSectionMutations";
import type { CardData } from "./DraggableCard";
import { formatAuthorList } from "@/lib/card-author";
import {
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "@/lib/card-anonymity";
import { buildCanvaConnectUrl } from "@/lib/canva-connect-return";
import {
  type SubjectOrder,
  normalizeSubjectOrder,
} from "@/lib/subject-order";

type SectionData = StreamSection;

type PanelTab = "rename" | "delete";
type CardDropPreview = {
  sectionId: string;
  draggedCardId: string;
  cardId: string;
  position: "before" | "after";
  placeholderHeight: number;
} | null;

type Props = {
  boardId: string;
  initialCards: CardData[];
  initialSections: SectionData[];
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  isStudentViewer?: boolean;
  /** Board's classroomId — enables the CardAuthorEditor roster picker. */
  classroomId?: string | null;
  anonymousAuthor?: boolean;
  /** Board.subjectOrder — 학생이름 시드 모달의 기본 선택값. */
  boardSubjectOrder?: SubjectOrder | null;
  /** Board.classroom 학생 수 — 시드 모달 안내 문구용. */
  classroomStudentCount?: number | null;
};

export function ColumnsBoard({
  boardId,
  initialCards,
  initialSections,
  currentUserId,
  currentRole,
  isStudentViewer,
  classroomId,
  anonymousAuthor = false,
  boardSubjectOrder,
  classroomStudentCount = null,
}: Props) {
  const [cards, setCards] = useState<CardData[]>(
    withBoardAnonymousAuthors(initialCards, anonymousAuthor),
  );
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const [sections, setSections] = useState<SectionData[]>(
    [...initialSections].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (a.pinned && b.pinned) return a.order - b.order;
      return b.order - a.order;
    }),
  );
  const [scrollRailWidth, setScrollRailWidth] = useState(0);
  const [authorEditCard, setAuthorEditCard] = useState<CardData | null>(null);
  const [overSectionId, setOverSectionId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<CardData | null>(null);
  const [openCard, setOpenCard] = useState<CardData | null>(null);
  const [panelState, setPanelState] = useState<{
    sectionId: string;
    tab: PanelTab;
  } | null>(null);
  const [addForSection, setAddForSection] = useState<string | null>(null);
  const [exportSectionId, setExportSectionId] = useState<string | null>(null);
  const [folderSectionId, setFolderSectionId] = useState<string | null>(null);
  const [organizing, setOrganizing] = useState<string | null>(null);
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(
    null,
  );
  const [cardDropPreview, setCardDropPreview] = useState<CardDropPreview>(null);
  const [seedingStudents, setSeedingStudents] = useState(false);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [seedDialogError, setSeedDialogError] = useState<string | null>(null);
  const [assignmentBusySectionId, setAssignmentBusySectionId] = useState<
    string | null
  >(null);
  const [feedbackTarget, setFeedbackTarget] = useState<{
    studentId: string | null;
    name: string | null;
    number: number | null;
    roster: RosterEntry[];
    sectionId: string;
  } | null>(null);

  const canEdit = currentRole === "owner" || currentRole === "editor";
  const canAddCard = canEdit || !!isStudentViewer;

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

  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const scrollBarRef = useRef<HTMLDivElement | null>(null);
  const columnsBoardRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef<"bar" | "area" | null>(null);

  // ── Hooks ──────────────────────────────────────────────────────────

  const {
    pendingCardIds,
    handleAdd,
    handleDeleteCard,
    handleEditCardSave,
    handleDuplicateCard,
    moveCard,
    handleCardReorder,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
  } = useCardMutations({
    boardId,
    canEdit,
    sections,
    cardsRef,
    setCards,
  });

  useBoardStream({ boardId, pendingCardIds, setCards, setSections });

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

  useEffect(() => {
    const boardEl = columnsBoardRef.current;
    if (!boardEl || typeof ResizeObserver === "undefined") return;

    const syncWidth = () => {
      setScrollRailWidth(boardEl.scrollWidth);
    };

    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    observer.observe(boardEl);
    return () => observer.disconnect();
  }, [cards.length, sections.length]);

  useEffect(() => {
    const area = scrollAreaRef.current;
    const bar = scrollBarRef.current;
    if (!area || !bar) return;

    const syncFromArea = () => {
      if (syncingScrollRef.current === "bar") return;
      syncingScrollRef.current = "area";
      bar.scrollLeft = area.scrollLeft;
      syncingScrollRef.current = null;
    };

    const syncFromBar = () => {
      if (syncingScrollRef.current === "area") return;
      syncingScrollRef.current = "bar";
      area.scrollLeft = bar.scrollLeft;
      syncingScrollRef.current = null;
    };

    area.addEventListener("scroll", syncFromArea, { passive: true });
    bar.addEventListener("scroll", syncFromBar, { passive: true });
    syncFromArea();
    return () => {
      area.removeEventListener("scroll", syncFromArea);
      bar.removeEventListener("scroll", syncFromBar);
    };
  }, [scrollRailWidth]);

  const { roster, authorsForSection, studentForSectionTitle } = useColumnRoster({
    classroomId,
    canEdit,
  });

  const {
    sortedSections,
    sectionOptions,
    handleAddSection,
    handleSectionPin,
    handleSeedFromStudents,
    handleSectionRenamed,
    handleSectionDeleted,
    moveSectionTo,
  } = useSectionMutations({
    boardId,
    canEdit,
    classroomId,
    sections,
    setSections,
    setCards,
    boardSubjectOrder,
  });

  const openSeedDialog = useCallback(() => {
    if (seedingStudents) return;
    setSeedDialogError(null);
    setSeedDialogOpen(true);
  }, [seedingStudents]);

  const closeSeedDialog = useCallback(() => {
    if (seedingStudents) return;
    setSeedDialogOpen(false);
  }, [seedingStudents]);

  async function handleSeedConfirm(order: SubjectOrder) {
    setSeedDialogError(null);
    try {
      const created = await handleSeedFromStudents(
        seedingStudents,
        setSeedingStudents as React.Dispatch<React.SetStateAction<boolean>>,
        order,
      );
      if (created && created.length > 0) {
        setSeedDialogOpen(false);
      }
    } catch (e) {
      console.error("[SeedStudentsDialog] confirm failed", e);
      setSeedDialogError(
        e instanceof Error ? e.message : "학생 시드 중 오류가 발생했어요.",
      );
    }
  }

  // ── Sort & grouping ────────────────────────────────────────────────

  async function setSortFor(sectionId: string, mode: SortMode) {
    if (!canEdit) return;
    const prev = sections;
    setSections((list) =>
      list.map((s) => (s.id === sectionId ? { ...s, sortMode: mode } : s)),
    );
    try {
      const res = await fetch(`/api/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sortMode: mode }),
      });
      if (!res.ok) {
        setSections(prev);
        alert(`정렬 저장 실패: ${await res.text().catch(() => "")}`);
      }
    } catch (e) {
      setSections(prev);
      console.error("[setSortFor]", e);
    }
  }

  async function handleSectionAssignment(
    sectionId: string,
    action: ColumnAssignmentAction,
  ) {
    if (!canEdit || !classroomId || assignmentBusySectionId) return;
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    const previousState = getSectionAssignmentState(section);
    const now = new Date().toISOString();
    const nextState =
      action === "distribute"
        ? {
            distributed: true,
            distributedAt: previousState.distributedAt ?? now,
            reminderSentAt: previousState.reminderSentAt,
          }
        : {
            distributed: true,
            distributedAt: previousState.distributedAt ?? now,
            reminderSentAt: now,
          };

    setAssignmentBusySectionId(sectionId);
    setSections((list) =>
      list.map((s) =>
        s.id === sectionId ? applySectionAssignmentState(s, nextState) : s,
      ),
    );

    try {
      const res = await fetch(`/api/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toSectionAssignmentPatch(nextState)),
      });
      if (!res.ok) {
        setSections((list) =>
          list.map((s) =>
            s.id === sectionId ? applySectionAssignmentState(s, previousState) : s,
          ),
        );
        alert(`과제 상태 저장 실패: ${await res.text().catch(() => "")}`);
        return;
      }

      const payload = (await res.json().catch(() => null)) as {
        section?: SectionData;
      } | null;
      const persistedState = payload?.section
        ? getSectionAssignmentState({ ...section, ...payload.section })
        : nextState;
      setSections((list) =>
        list.map((s) =>
          s.id === sectionId ? applySectionAssignmentState(s, persistedState) : s,
        ),
      );
      alert(
        action === "distribute"
          ? "과제를 배부했어요."
          : "제출 알림을 보냈어요.",
      );
    } catch (e) {
      setSections((list) =>
        list.map((s) =>
          s.id === sectionId ? applySectionAssignmentState(s, previousState) : s,
        ),
      );
      console.error("[handleSectionAssignment]", e);
      alert("과제 상태 저장 중 오류가 발생했어요.");
    } finally {
      setAssignmentBusySectionId(null);
    }
  }

  async function handleOrganizeToCanva(sectionId: string) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    const sectionCards = cards.filter((c) => (c.sectionId ?? "") === sectionId);
    const canvaUrls = sectionCards
      .filter(
        (c) =>
          c.linkUrl &&
          (c.linkUrl.includes("canva.link") || c.linkUrl.includes("canva.com")),
      )
      .map((c) => c.linkUrl!);

    if (canvaUrls.length === 0) {
      alert("이 섹션에 Canva 링크가 없습니다.");
      return;
    }

    if (
      !window.confirm(
        `"${section.title}" 폴더를 Canva에 생성하고\n${canvaUrls.length}개 디자인을 이동할까요?`,
      )
    )
      return;

    setOrganizing(sectionId);
    try {
      const res = await fetch("/api/canva/organize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sectionTitle: section.title, canvaUrls }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "canva_not_connected") {
          if (
            window.confirm("Canva 계정 연결이 필요합니다. 지금 연결할까요?")
          ) {
            window.location.href = buildCanvaConnectUrl();
          }
        } else {
          alert(`정리 실패: ${data.error}`);
        }
        setOrganizing(null);
        return;
      }

      const data = await res.json();
      alert(data.summary);
    } catch (err) {
      console.error(err);
      alert("Canva 폴더 정리 중 오류가 발생했습니다.");
    }
    setOrganizing(null);
  }

  async function handleImportFromCanva(
    sectionId: string,
    designs: { id: string; title: string; thumbnail?: string }[],
  ) {
    for (const d of designs) {
      try {
        const viewUrl = `https://www.canva.com/design/${d.id}/view`;
        const res = await fetch("/api/cards", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            boardId,
            title: d.title,
            content: "",
            linkUrl: viewUrl,
            linkTitle: d.title,
            linkImage: d.thumbnail || null,
            x: 0,
            y: 0,
            order: cards.filter((c) => (c.sectionId ?? "") === sectionId)
              .length,
            sectionId,
          }),
        });
        if (res.ok) {
          const { card } = await res.json();
          setCards((prev) => [...prev, card]);
        }
      } catch (err) {
        console.error(err);
      }
    }
    setFolderSectionId(null);
  }

  const sortModeById = useMemo(() => {
    const map: Record<string, SortMode> = {};
    for (const s of sections) map[s.id] = toSortMode(s.sortMode);
    return map;
  }, [sections]);

  const cardsBySection = useMemo(() => {
    const map = new Map<string, CardData[]>();
    for (const card of cards) {
      const key = card.sectionId ?? "";
      const bucket = map.get(key);
      if (bucket) bucket.push(card);
      else map.set(key, [card]);
    }
    for (const [sectionId, bucket] of map) {
      const mode = sortModeById[sectionId] ?? "manual";
      bucket.sort(comparatorFor(mode));
    }
    return map;
  }, [cards, sortModeById]);

  function getCardsForSection(sectionId: string): CardData[] {
    return cardsBySection.get(sectionId) ?? [];
  }

  const detailCards = openCard
    ? cardsBySection.get(openCard.sectionId ?? "") ?? []
    : [];
  const openCardIndex = openCard
    ? detailCards.findIndex((card) => card.id === openCard.id)
    : -1;
  const previousOpenCard =
    openCardIndex > 0 ? detailCards[openCardIndex - 1] : null;
  const nextOpenCard =
    openCardIndex >= 0 && openCardIndex < detailCards.length - 1
      ? detailCards[openCardIndex + 1]
      : null;

  function handleDrop(e: React.DragEvent, targetSectionId: string) {
    e.preventDefault();
    setOverSectionId(null);
    setDraggingSectionId(null);
    setCardDropPreview(null);
    const sectionId = e.dataTransfer.getData("application/section-id");
    if (sectionId) {
      moveSectionTo(sectionId, targetSectionId);
      return;
    }
    const cardId = e.dataTransfer.getData("application/card-id");
    if (cardId) moveCard(cardId, targetSectionId);
  }

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div className="board-canvas-wrap board-canvas-wrap-columns">
      <div ref={scrollAreaRef} className="columns-scroll-area">
        <div ref={columnsBoardRef} className="columns-board">
          {sortedSections.map((section) => (
            <ColumnView
              key={section.id}
              section={{
                id: section.id,
                title: section.title,
              }}
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
              assignmentState={getSectionAssignmentState(
                section,
                assignmentBusySectionId === section.id,
              )}
              roster={roster}
              authorsForSection={authorsForSection}
              studentForSectionTitle={studentForSectionTitle}
              onSetSort={(mode) => setSortFor(section.id, mode)}
              onAssignmentAction={(action) =>
                handleSectionAssignment(section.id, action)
              }
              onPin={(pinned) => handleSectionPin(section.id, pinned)}
              onSectionDragStart={(id) => setDraggingSectionId(id)}
              onSectionDragEnd={() => setDraggingSectionId(null)}
              onCardDragStart={handleDragStart}
              onCardDragEnd={(e) => {
                setCardDropPreview(null);
                handleDragEnd(e);
              }}
              onCardDropReorder={handleCardReorder}
              onDragOver={handleDragOver}
              onDragEnter={(id) => setOverSectionId(id)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setOverSectionId(null);
                  setCardDropPreview(null);
                }
              }}
              onDrop={handleDrop}
              onCardDropPreview={setCardDropPreview}
              onClearCardDropPreview={() => setCardDropPreview(null)}
              onRename={() =>
                setPanelState({ sectionId: section.id, tab: "rename" })
              }
              onDelete={() =>
                setPanelState({ sectionId: section.id, tab: "delete" })
              }
              onFolder={() => setFolderSectionId(section.id)}
              onExport={() => setExportSectionId(section.id)}
              onOrganize={() => handleOrganizeToCanva(section.id)}
              onFeedback={(args) => setFeedbackTarget(args)}
              onCardOpen={(c) => setOpenCard(c)}
              onCardEdit={(c) => setEditingCard(c)}
              onCardEditAuthors={(c) => setAuthorEditCard(c)}
              onCardDuplicate={handleDuplicateCard}
              onCardDelete={handleDeleteCard}
              onCardToggleGuide={handleToggleGuide}
              onAddInColumn={
                canAddCard ? () => setAddForSection(section.id) : undefined
              }
            />
          ))}

          {canEdit && (
            <div className="column-add-stack">
              <button
                type="button"
                className="column-add-btn"
                onClick={handleAddSection}
              >
                + 섹션 추가
              </button>
              {classroomId && (
                <button
                  type="button"
                  className="column-add-btn column-add-btn-seed"
                  onClick={openSeedDialog}
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

      {canAddCard && (
        <AddCardButton
          onAdd={handleAdd}
          sections={sectionOptions}
          canAssignAuthors={canEdit}
          canConfigurePoll={canEdit || !!isStudentViewer}
          classroomId={classroomId}
        />
      )}

      {addForSection && (
        <AddCardModal
          onAdd={handleAdd}
          onClose={() => setAddForSection(null)}
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

      {panelState &&
        (() => {
          const section = sections.find((s) => s.id === panelState.sectionId);
          if (!section) return null;
          return (
            <SectionActionsPanel
              open={true}
              onClose={() => setPanelState(null)}
              section={{ id: section.id, title: section.title }}
              currentRole={currentRole}
              defaultTab={panelState.tab}
              onRenamed={(t) => handleSectionRenamed(section.id, t)}
              onDeleted={() => handleSectionDeleted(section.id)}
            />
          );
        })()}

      {folderSectionId && (
        <CanvaFolderModal
          sectionTitle={
            sections.find((s) => s.id === folderSectionId)?.title ?? ""
          }
          onImport={(designs) =>
            handleImportFromCanva(folderSectionId, designs)
          }
          onClose={() => setFolderSectionId(null)}
        />
      )}

      {exportSectionId && (
        <ExportModal
          sectionTitle={
            sections.find((s) => s.id === exportSectionId)?.title ?? ""
          }
          cards={getCardsForSection(exportSectionId)}
          onClose={() => setExportSectionId(null)}
        />
      )}

      {feedbackTarget && (
        <AiFeedbackModal
          studentId={feedbackTarget.studentId}
          studentName={feedbackTarget.name}
          studentNumber={feedbackTarget.number}
          roster={feedbackTarget.roster}
          sectionId={feedbackTarget.sectionId}
          onClose={() => setFeedbackTarget(null)}
        />
      )}

      {classroomId && (
        <SeedStudentsDialog
          open={seedDialogOpen && canEdit}
          studentCount={classroomStudentCount}
          defaultOrder={normalizeSubjectOrder(
            boardSubjectOrder ?? sections.find((s) => s.pinned)?.order ?? "asc",
          )}
          busy={seedingStudents}
          errorMessage={seedDialogError}
          onClose={closeSeedDialog}
          onConfirm={handleSeedConfirm}
        />
      )}
    </div>
  );
}

type PersistedAssignmentState = Omit<ColumnAssignmentState, "pending">;

function getSectionAssignmentState(
  section: SectionData,
  pending = false,
): ColumnAssignmentState {
  const distributedAt = section.assignmentPublishedAt ?? null;
  const reminderSentAt = section.assignmentReminderSentAt ?? null;

  return {
    distributed: Boolean(distributedAt),
    distributedAt,
    reminderSentAt,
    pending,
  };
}

function applySectionAssignmentState(
  section: SectionData,
  state: PersistedAssignmentState | ColumnAssignmentState,
): SectionData {
  return {
    ...section,
    assignmentPublishedAt: state.distributed ? state.distributedAt : null,
    assignmentReminderSentAt: state.reminderSentAt,
  };
}

function toSectionAssignmentPatch(state: PersistedAssignmentState) {
  return {
    assignmentPublishedAt: state.distributed ? state.distributedAt : null,
    assignmentReminderSentAt: state.reminderSentAt,
  };
}
