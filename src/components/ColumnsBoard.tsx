"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AddCardButton } from "./AddCardButton";
import { AddCardModal, type AddCardData } from "./AddCardModal";
import { CardDetailModal } from "./cards/CardDetailModal";
import { CardAuthorEditor, type SavedAuthor } from "./cards/CardAuthorEditor";
import { EditCardModal, type EditCardUpdates } from "./EditCardModal";
import { ExportModal } from "./ExportModal";
import { CanvaFolderModal } from "./CanvaFolderModal";
import { SectionActionsPanel } from "./SectionActionsPanel";
import { AiFeedbackModal } from "./feedback/AiFeedbackModal";
import { ColumnView } from "./columns/ColumnView";
import { comparatorFor, toSortMode, type SortMode } from "./columns/sort";
import { useBoardStream, type StreamSection } from "./columns/useBoardStream";
import { useColumnRoster, type RosterEntry } from "./columns/useColumnRoster";
import { useCardMutations } from "./columns/useCardMutations";
import { useSectionMutations } from "./columns/useSectionMutations";
import type { CardData } from "./DraggableCard";

type SectionData = StreamSection;

type PanelTab = "rename" | "delete";

type Props = {
  boardId: string;
  initialCards: CardData[];
  initialSections: SectionData[];
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  isStudentViewer?: boolean;
  /** Board's classroomId — enables the CardAuthorEditor roster picker. */
  classroomId?: string | null;
};

export function ColumnsBoard({
  boardId,
  initialCards,
  initialSections,
  currentUserId,
  currentRole,
  isStudentViewer,
  classroomId,
}: Props) {
  const [cards, setCards] = useState<CardData[]>(initialCards);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const [sections, setSections] = useState<SectionData[]>(
    [...initialSections].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (a.pinned && b.pinned) return a.order - b.order;
      return b.order - a.order;
    })
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
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [seedingStudents, setSeedingStudents] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<{
    studentId: string | null;
    name: string | null;
    number: number | null;
    roster: RosterEntry[];
    sectionId: string;
  } | null>(null);

  const canEdit = currentRole === "owner" || currentRole === "editor";
  const canAddCard = canEdit || !!isStudentViewer;

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

  const { authorsForSection, studentForSectionTitle } = useColumnRoster({
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
  });

  // ── Sort & grouping ────────────────────────────────────────────────

  async function setSortFor(sectionId: string, mode: SortMode) {
    if (!canEdit) return;
    const prev = sections;
    setSections((list) =>
      list.map((s) => (s.id === sectionId ? { ...s, sortMode: mode } : s))
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

  async function handleOrganizeToCanva(sectionId: string) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    const sectionCards = cards.filter(
      (c) => (c.sectionId ?? "") === sectionId
    );
    const canvaUrls = sectionCards
      .filter(
        (c) =>
          c.linkUrl &&
          (c.linkUrl.includes("canva.link") || c.linkUrl.includes("canva.com"))
      )
      .map((c) => c.linkUrl!);

    if (canvaUrls.length === 0) {
      alert("이 섹션에 Canva 링크가 없습니다.");
      return;
    }

    if (
      !window.confirm(
        `"${section.title}" 폴더를 Canva에 생성하고\n${canvaUrls.length}개 디자인을 이동할까요?`
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
          if (window.confirm("Canva 계정 연결이 필요합니다. 지금 연결할까요?")) {
            window.location.href = "/api/auth/canva";
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
    designs: { id: string; title: string; thumbnail?: string }[]
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

  function handleDrop(e: React.DragEvent, targetSectionId: string) {
    e.preventDefault();
    setOverSectionId(null);
    setDraggingSectionId(null);
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
            section={{ id: section.id, title: section.title }}
            pinned={section.pinned}
            sectionCards={getCardsForSection(section.id)}
            canEdit={canEdit}
            currentRole={currentRole}
            currentUserId={currentUserId}
            classroomId={classroomId}
            sortMode={sortModeById[section.id] ?? "manual"}
            overSectionId={overSectionId}
            draggingSectionId={draggingSectionId}
            organizing={organizing}
            authorsForSection={authorsForSection}
            studentForSectionTitle={studentForSectionTitle}
            onSetSort={(mode) => setSortFor(section.id, mode)}
            onPin={(pinned) => handleSectionPin(section.id, pinned)}
            onSectionDragStart={(id) => setDraggingSectionId(id)}
            onSectionDragEnd={() => setDraggingSectionId(null)}
            onCardDragStart={handleDragStart}
            onCardDragEnd={handleDragEnd}
            onCardDropReorder={handleCardReorder}
            onDragOver={handleDragOver}
            onDragEnter={(id) => setOverSectionId(id)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOverSectionId(null);
              }
            }}
            onDrop={handleDrop}
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
            onAddInColumn={canAddCard ? () => setAddForSection(section.id) : undefined}
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
                onClick={() => {
                  handleSeedFromStudents(
                    seedingStudents,
                    setSeedingStudents as React.Dispatch<React.SetStateAction<boolean>>
                  );
                }}
                disabled={seedingStudents}
                title="학급 학생 명단으로 칼럼을 한 번에 추가"
              >
                {seedingStudents ? "추가 중…" : "🧑 학생 이름으로 칼럼 만들기"}
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
        <div className="columns-scrollbar-rail" style={{ width: scrollRailWidth }} />
      </div>

      {canAddCard && <AddCardButton onAdd={handleAdd} sections={sectionOptions} />}

      {addForSection && (
        <AddCardModal
          onAdd={handleAdd}
          onClose={() => setAddForSection(null)}
          sections={sectionOptions}
          defaultSectionId={addForSection}
        />
      )}

      {editingCard && (
        <EditCardModal
          card={editingCard}
          onSave={(updates) => handleEditCardSave(editingCard, updates)}
          onClose={() => setEditingCard(null)}
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
            setCards((prev) =>
              prev.map((c) =>
                c.id === authorEditCard.id
                  ? {
                      ...c,
                      authors,
                      studentAuthorId: authors[0]?.studentId ?? null,
                      externalAuthorName:
                        authors.length > 0
                          ? authors
                              .slice(0, 3)
                              .map((a) => a.displayName)
                              .join(", ") +
                            (authors.length > 3
                              ? ` 외 ${authors.length - 1}명`
                              : "")
                          : null,
                    }
                  : c
              )
            );
          }}
          onClose={() => setAuthorEditCard(null)}
        />
      )}

      <CardDetailModal
        card={openCard}
        onClose={() => setOpenCard(null)}
        cards={
          openCard
            ? cards
                .filter((c) => c.sectionId === openCard.sectionId)
                .sort(
                  comparatorFor(sortModeById[openCard.sectionId ?? ""] ?? "manual")
                )
            : cards
        }
        onChange={setOpenCard}
        onEditAuthors={(c) => setAuthorEditCard(c)}
        canEditAuthors={(c) => canEdit || c.studentAuthorId === currentUserId}
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
          onImport={(designs) => handleImportFromCanva(folderSectionId, designs)}
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
    </div>
  );
}
