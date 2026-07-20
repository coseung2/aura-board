"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ColumnAssignmentAction,
  ColumnAssignmentState,
} from "./columns/ColumnView";
import { ColumnsBoardOverlays } from "./columns/ColumnsBoardOverlays";
import { ColumnsBoardCanvas } from "./columns/ColumnsBoardCanvas";
import { comparatorFor, toSortMode, type SortMode } from "./columns/sort";
import { useBoardStream } from "./columns/useBoardStream";
import { useBoardAnonymityChange } from "@/hooks/useBoardAnonymityChange";
import { useColumnRoster } from "./columns/useColumnRoster";
import { useCardMutations } from "./columns/useCardMutations";
import { useSectionMutations } from "./columns/useSectionMutations";
import type { SavedAuthor } from "./cards/CardAuthorEditor";
import type { CardData } from "./DraggableCard";
import { formatAuthorList } from "@/lib/card-author";
import {
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "@/lib/card-anonymity";
import { buildCanvaConnectUrl } from "@/lib/canva-connect-return";
import type { ColumnsPresenceActivity } from "@/lib/columns-presence";
import type { SubjectOrder } from "@/lib/subject-order";
import {
  BOARD_SECTIONS_REORDERED_EVENT,
  type BoardSectionsReorderedDetail,
} from "@/lib/board-section-events";
import { sortSections } from "@/lib/sort-sections";
import type {
  ColumnsCardDropPreview,
  ColumnsFeedbackTarget,
  ColumnsPanelState,
  ColumnsSection,
} from "./columns/columns-board-types";

type SectionData = ColumnsSection;

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
    [...initialSections].sort(sortSections),
  );
  const [scrollRailWidth, setScrollRailWidth] = useState(0);
  const [authorEditCard, setAuthorEditCard] = useState<CardData | null>(null);
  const [overSectionId, setOverSectionId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<CardData | null>(null);
  const [openCard, setOpenCard] = useState<CardData | null>(null);
  const [panelState, setPanelState] = useState<ColumnsPanelState | null>(null);
  const [addForSection, setAddForSection] = useState<string | null>(null);
  const [exportSectionId, setExportSectionId] = useState<string | null>(null);
  const [folderSectionId, setFolderSectionId] = useState<string | null>(null);
  const [organizing, setOrganizing] = useState<string | null>(null);
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(
    null,
  );
  const [cardDropPreview, setCardDropPreview] =
    useState<ColumnsCardDropPreview>(null);
  const [seedingStudents, setSeedingStudents] = useState(false);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [seedDialogError, setSeedDialogError] = useState<string | null>(null);
  const [assignmentBusySectionId, setAssignmentBusySectionId] = useState<
    string | null
  >(null);
  const [feedbackTarget, setFeedbackTarget] =
    useState<ColumnsFeedbackTarget | null>(null);

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

  useEffect(() => {
    setSections([...initialSections].sort(sortSections));
  }, [initialSections]);

  useEffect(() => {
    function handleSectionsReordered(event: Event) {
      const detail = (event as CustomEvent<BoardSectionsReorderedDetail>).detail;
      if (!detail || detail.boardId !== boardId) return;
      const orderById = new Map(
        detail.sections.map((section) => [section.id, section] as const),
      );
      setSections((list) =>
        list
          .map((section) => {
            const updated = orderById.get(section.id);
            return updated
              ? {
                  ...section,
                  order: updated.order,
                  pinned: updated.pinned,
                }
              : section;
          })
          .sort(sortSections),
      );
    }

    window.addEventListener(
      BOARD_SECTIONS_REORDERED_EVENT,
      handleSectionsReordered,
    );
    return () => {
      window.removeEventListener(
        BOARD_SECTIONS_REORDERED_EVENT,
        handleSectionsReordered,
      );
    };
  }, [boardId]);

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

  const presenceActivity = useMemo<ColumnsPresenceActivity>(() => {
    if (editingCard) {
      return {
        mode: "editing",
        sectionId: editingCard.sectionId ?? null,
        cardId: editingCard.id,
      };
    }
    if (authorEditCard) {
      return {
        mode: "editing",
        sectionId: authorEditCard.sectionId ?? null,
        cardId: authorEditCard.id,
      };
    }
    if (panelState) {
      return { mode: "editing", sectionId: panelState.sectionId };
    }
    if (feedbackTarget) {
      return { mode: "editing", sectionId: feedbackTarget.sectionId };
    }
    if (organizing) {
      return { mode: "editing", sectionId: organizing };
    }
    if (addForSection) {
      return { mode: "adding", sectionId: addForSection };
    }
    if (folderSectionId) {
      return { mode: "adding", sectionId: folderSectionId };
    }
    if (seedDialogOpen) {
      return { mode: "adding" };
    }
    if (cardDropPreview) {
      return {
        mode: "dragging",
        sectionId: cardDropPreview.sectionId,
        cardId: cardDropPreview.draggedCardId,
      };
    }
    if (draggingSectionId || overSectionId) {
      return {
        mode: "dragging",
        sectionId: overSectionId ?? draggingSectionId,
      };
    }
    if (exportSectionId) {
      return { mode: "viewing", sectionId: exportSectionId };
    }
    if (openCard) {
      return {
        mode: "viewing",
        sectionId: openCard.sectionId ?? null,
        cardId: openCard.id,
      };
    }
    return { mode: "browsing" };
  }, [
    addForSection,
    authorEditCard,
    cardDropPreview,
    draggingSectionId,
    editingCard,
    exportSectionId,
    feedbackTarget,
    folderSectionId,
    openCard,
    organizing,
    overSectionId,
    panelState,
    seedDialogOpen,
  ]);

  const realtime = useBoardStream({
    boardId,
    currentUserId,
    currentRole,
    isStudentViewer,
    activity: presenceActivity,
    pendingCardIds,
    setCards,
    setSections,
  });

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

  function handleAuthorsSaved(cardId: string, authors: SavedAuthor[]) {
    const authorPatch: Partial<CardData> = {
      authors,
      studentAuthorId: authors[0]?.studentId ?? null,
      externalAuthorName:
        authors.length > 0
          ? formatAuthorList(authors, null, null, null)
          : null,
    };
    setCards((prev) =>
      prev.map((card) => (card.id === cardId ? { ...card, ...authorPatch } : card)),
    );
    setOpenCard((current) =>
      current?.id === cardId ? { ...current, ...authorPatch } : current,
    );
    setAuthorEditCard((current) =>
      current?.id === cardId ? { ...current, ...authorPatch } : current,
    );
  }

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div
      className="board-canvas-wrap board-canvas-wrap-columns"
      style={{ position: "relative" }}
    >
      <ColumnsBoardCanvas
        realtime={{ status: realtime.status, presence: realtime.presence }}
        scrollAreaRef={scrollAreaRef}
        columnsBoardRef={columnsBoardRef}
        scrollBarRef={scrollBarRef}
        scrollRailWidth={scrollRailWidth}
        sortedSections={sortedSections}
        sortModeById={sortModeById}
        getCardsForSection={getCardsForSection}
        boardId={boardId}
        canEdit={canEdit}
        canAddCard={canAddCard}
        currentRole={currentRole}
        currentUserId={currentUserId}
        classroomId={classroomId}
        overSectionId={overSectionId}
        draggingSectionId={draggingSectionId}
        cardDropPreview={cardDropPreview}
        organizing={organizing}
        assignmentBusySectionId={assignmentBusySectionId}
        roster={roster}
        authorsForSection={authorsForSection}
        studentForSectionTitle={studentForSectionTitle}
        onSetSort={setSortFor}
        onAssignmentAction={handleSectionAssignment}
        onPin={handleSectionPin}
        onSectionDragStart={(id) => setDraggingSectionId(id)}
        onSectionDragEnd={() => setDraggingSectionId(null)}
        onCardDragStart={handleDragStart}
        onCardDragEnd={(event) => {
          setCardDropPreview(null);
          handleDragEnd(event);
        }}
        onCardDropReorder={handleCardReorder}
        onDragOver={handleDragOver}
        onDragEnter={(id) => setOverSectionId(id)}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setOverSectionId(null);
            setCardDropPreview(null);
          }
        }}
        onDrop={handleDrop}
        onCardDropPreview={setCardDropPreview}
        onClearCardDropPreview={() => setCardDropPreview(null)}
        onRename={(sectionId) => setPanelState({ sectionId, tab: "rename" })}
        onDelete={(sectionId) => setPanelState({ sectionId, tab: "delete" })}
        onFolder={(sectionId) => setFolderSectionId(sectionId)}
        onExport={(sectionId) => setExportSectionId(sectionId)}
        onOrganize={handleOrganizeToCanva}
        onFeedback={(args) => setFeedbackTarget(args)}
        onCardOpen={(card) => setOpenCard(card)}
        onCardEdit={(card) => setEditingCard(card)}
        onCardEditAuthors={(card) => setAuthorEditCard(card)}
        onCardDuplicate={handleDuplicateCard}
        onCardDelete={handleDeleteCard}
        onCardToggleGuide={handleToggleGuide}
        onAddInColumn={(sectionId) => setAddForSection(sectionId)}
        onAddSection={handleAddSection}
        onSeedStudents={openSeedDialog}
        seedingStudents={seedingStudents}
      />
      <ColumnsBoardOverlays
        boardId={boardId}
        currentUserId={currentUserId}
        currentRole={currentRole}
        isStudentViewer={isStudentViewer}
        classroomId={classroomId}
        classroomStudentCount={classroomStudentCount}
        boardSubjectOrder={boardSubjectOrder}
        canEdit={canEdit}
        canAddCard={canAddCard}
        sections={sections}
        sectionOptions={sectionOptions}
        onAdd={handleAdd}
        onEditCardSave={handleEditCardSave}
        onAuthorSaved={handleAuthorsSaved}
        onSeedConfirm={handleSeedConfirm}
        addForSection={addForSection}
        onCloseAdd={() => setAddForSection(null)}
        editingCard={editingCard}
        onCloseEditing={() => setEditingCard(null)}
        authorEditCard={authorEditCard}
        onCloseAuthorEdit={() => setAuthorEditCard(null)}
        openCard={openCard}
        onCloseCard={() => setOpenCard(null)}
        hasPreviousCard={!!previousOpenCard}
        hasNextCard={!!nextOpenCard}
        onPreviousCard={
          previousOpenCard ? () => setOpenCard(previousOpenCard) : undefined
        }
        onNextCard={nextOpenCard ? () => setOpenCard(nextOpenCard) : undefined}
        onEditAuthors={(card) => setAuthorEditCard(card)}
        canEditAuthors={(card) =>
          canEdit || card.studentAuthorId === currentUserId
        }
        panelState={panelState}
        onClosePanel={() => setPanelState(null)}
        onRenameSection={handleSectionRenamed}
        onDeleteSection={handleSectionDeleted}
        folderSectionId={folderSectionId}
        onImportFromCanva={(designs) =>
          folderSectionId
            ? handleImportFromCanva(folderSectionId, designs)
            : undefined
        }
        onCloseFolder={() => setFolderSectionId(null)}
        exportSectionId={exportSectionId}
        onCloseExport={() => setExportSectionId(null)}
        getCardsForSection={getCardsForSection}
        feedbackTarget={feedbackTarget}
        onCloseFeedback={() => setFeedbackTarget(null)}
        seedDialogOpen={seedDialogOpen}
        seedingStudents={seedingStudents}
        seedDialogError={seedDialogError}
        onCloseSeedDialog={closeSeedDialog}
      />
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
