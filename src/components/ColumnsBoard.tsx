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
import {
  useBoardStream,
  type StreamSection,
} from "./columns/useBoardStream";
import { useColumnRoster, type RosterEntry } from "./columns/useColumnRoster";
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
  const [scrollRailWidth, setScrollRailWidth] = useState(0);
  const [authorEditCard, setAuthorEditCard] = useState<CardData | null>(null);
  const [sections, setSections] = useState<SectionData[]>(
    [...initialSections].sort((a, b) => a.order - b.order)
  );
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
  // Students can add cards to their classroom's columns board. Section
  // membership rules (sectionId must belong to this board) are enforced
  // server-side by /api/cards + the external-cards sectionId guard.
  const canAddCard = canEdit || !!isStudentViewer;

  // Cards currently mid-flight in a local mutation. SSE snapshots skip
  // these IDs so an in-progress optimistic update isn't stomped by a
  // server snapshot that hasn't seen the mutation commit yet.
  const pendingCardIds = useRef<Set<string>>(new Set());
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const scrollBarRef = useRef<HTMLDivElement | null>(null);
  const columnsBoardRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef<"bar" | "area" | null>(null);

  function trackCardMutation<T>(id: string, run: () => Promise<T>): Promise<T> {
    pendingCardIds.current.add(id);
    return run().finally(() => {
      pendingCardIds.current.delete(id);
    });
  }

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

  /* ── Per-column sort persistence (shared-column-sort 2026-04-20) ──
     localStorage 단독이 아닌 Section.sortMode 서버 값을 단일 소스로 사용.
     교사가 드롭다운을 바꾸면 PATCH /api/sections/:id로 저장 → SSE
     snapshot으로 학생 화면도 동기화. 학생은 드롭다운이 disabled라 읽기만. */
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

    const sectionCards = getCardsForSection(sectionId);
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
            order: getCardsForSection(sectionId).length,
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

  // shared-column-sort: sortMode는 sections(서버) 기반. sections 변경 시
  // 정렬 재계산 트리거되도록 의존성에 포함.
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

  /* ── Card drag/drop ── */
  async function moveCard(cardId: string, targetSectionId: string) {
    const targetCards = getCardsForSection(targetSectionId);
    const newOrder = targetCards.length;
    const prevCards = [...cards];

    setCards((list) =>
      list.map((c) =>
        c.id === cardId
          ? { ...c, sectionId: targetSectionId, order: newOrder }
          : c
      )
    );

    await trackCardMutation(cardId, async () => {
      try {
        const res = await fetch(`/api/cards/${cardId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sectionId: targetSectionId, order: newOrder }),
        });
        if (!res.ok) {
          console.error("이동 실패:", await res.text());
          setCards(prevCards);
        }
      } catch (err) {
        console.error(err);
        setCards(prevCards);
      }
    });
  }

  function handleDragStart(e: React.DragEvent, cardId: string) {
    e.dataTransfer.setData("application/card-id", cardId);
    e.dataTransfer.effectAllowed = "move";
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.add("is-dragging");
    }
  }

  function handleDragEnd(e: React.DragEvent) {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.remove("is-dragging");
    }
    setOverSectionId(null);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent, targetSectionId: string) {
    e.preventDefault();
    setOverSectionId(null);
    setDraggingSectionId(null);
    // Section drag takes priority — distinguished by the mime key set
    // in the column-header's onDragStart.
    const sectionId = e.dataTransfer.getData("application/section-id");
    if (sectionId) {
      moveSectionTo(sectionId, targetSectionId);
      return;
    }
    const cardId = e.dataTransfer.getData("application/card-id");
    if (cardId) moveCard(cardId, targetSectionId);
  }

  /* ── Section reorder (drag-drop) ──
   *
   * Column headers are HTML5-draggable. Dropping section A onto
   * section B's column moves A to B's position in the list. All
   * affected sections are re-indexed 0..N-1 locally and PATCH'd in
   * parallel. Optimistic state; on failure we roll back.
   *
   * Distinguishable from card drag via the `application/section-id`
   * mime key — card drag uses `application/card-id`. */
  async function moveSectionTo(sectionId: string, targetSectionId: string) {
    if (sectionId === targetSectionId) return;
    const fromIdx = sections.findIndex((s) => s.id === sectionId);
    const toIdx = sections.findIndex((s) => s.id === targetSectionId);
    if (fromIdx === -1 || toIdx === -1) return;

    const prev = sections;
    const next = [...sections];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    const normalised = next.map((s, i) => ({ ...s, order: i }));
    setSections(normalised);

    const changed = normalised.filter((s, i) => prev[i]?.id !== s.id);
    try {
      const responses = await Promise.all(
        changed.map((s) =>
          fetch(`/api/sections/${s.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ order: s.order }),
          })
        )
      );
      if (responses.some((r) => !r.ok)) {
        console.error("섹션 순서 변경 실패");
        setSections(prev);
      }
    } catch (err) {
      console.error(err);
      setSections(prev);
    }
  }

  /* ── Add card (shared by FAB and per-column buttons) ── */
  async function handleAdd(data: AddCardData) {
    const targetSection = data.sectionId ?? sections[0]?.id ?? null;
    const order = targetSection ? getCardsForSection(targetSection).length : 0;
    try {
      const res = await fetch(`/api/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          boardId,
          title: data.title,
          content: data.content,
          linkUrl: data.linkUrl || null,
          linkTitle: data.linkTitle || null,
          linkDesc: data.linkDesc || null,
          linkImage: data.linkImage || null,
          attachments: data.attachments,
          color: data.color || null,
          x: 0,
          y: 0,
          order,
          sectionId: targetSection,
        }),
      });
      if (res.ok) {
        const { card } = await res.json();
        setCards((prev) => [...prev, card]);
      } else {
        alert(`카드 추가 실패: ${await res.text()}`);
      }
    } catch (err) {
      console.error(err);
    }
  }

  /* ── Card actions ── */
  async function handleDeleteCard(id: string) {
    if (!window.confirm("이 카드를 삭제할까요?")) return;
    const prev = [...cards];
    setCards((list) => list.filter((c) => c.id !== id));
    await trackCardMutation(id, async () => {
      try {
        const res = await fetch(`/api/cards/${id}`, { method: "DELETE" });
        if (!res.ok) setCards(prev);
      } catch {
        setCards(prev);
      }
    });
  }

  async function handleEditCardSave(updates: EditCardUpdates) {
    if (!editingCard) return;
    const prev = [...cards];
    const cardId = editingCard.id;
    const { attachments: updateAttachments, ...restUpdates } = updates;
    const optimisticUpdates: Partial<CardData> = { ...restUpdates };
    if (updateAttachments) {
      optimisticUpdates.attachments = updateAttachments.map((a, idx) => ({
        id: a.tempId,
        kind: a.kind,
        url: a.url,
        fileName: a.fileName ?? null,
        fileSize: a.fileSize ?? null,
        mimeType: a.mimeType ?? null,
        order: idx,
      }));
    }
    setCards((list) =>
      list.map((c) => (c.id === cardId ? { ...c, ...optimisticUpdates } : c))
    );
    await trackCardMutation(cardId, async () => {
      try {
        const res = await fetch(`/api/cards/${cardId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (!res.ok) {
          setCards(prev);
          return;
        }
        const data = (await res.json()) as { card?: CardData };
        if (data.card) {
          setCards((list) => list.map((c) => (c.id === cardId ? data.card! : c)));
        }
      } catch {
        setCards(prev);
      }
    });
  }

  async function handleDuplicateCard(card: CardData) {
    try {
      const res = await fetch(`/api/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          boardId,
          title: `${card.title} (복사)`,
          content: card.content,
          imageUrl: card.imageUrl || null,
          linkUrl: card.linkUrl || null,
          videoUrl: card.videoUrl || null,
          color: card.color || null,
          x: 0,
          y: 0,
          order: getCardsForSection(card.sectionId ?? "").length,
          sectionId: card.sectionId,
        }),
      });
      if (res.ok) {
        const { card: newCard } = await res.json();
        setCards((prev) => [...prev, newCard]);
      }
    } catch (err) {
      console.error(err);
    }
  }

  /* ── Section actions ── */
  async function handleAddSection() {
    const title = window.prompt("새 섹션 이름:");
    if (!title?.trim()) return;
    try {
      const res = await fetch(`/api/sections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId, title: title.trim() }),
      });
      if (res.ok) {
        const { section } = await res.json();
        setSections((prev) => [...prev, section]);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // 학생-시드: 학급 학생을 출석번호 순으로 섹션화. classroom-linked 보드에서만
  // 노출되며 1회성 시드라 현재 섹션 뒤에 append. 명시적 확인 모달 후 호출.
  async function handleSeedFromStudents() {
    if (seedingStudents) return;
    if (!window.confirm("학급 학생 명단으로 칼럼을 추가할까요?")) return;
    setSeedingStudents(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/sections/seed-students`, {
        method: "POST",
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error;
        alert(typeof msg === "string" ? msg : "칼럼 추가 실패");
        return;
      }
      const { sections: created } = (await res.json()) as {
        sections: SectionData[];
      };
      setSections((prev) => [...prev, ...created]);
    } finally {
      setSeedingStudents(false);
    }
  }

  function handleSectionRenamed(sectionId: string, newTitle: string) {
    setSections((list) =>
      list.map((s) => (s.id === sectionId ? { ...s, title: newTitle } : s))
    );
  }

  function handleSectionDeleted(sectionId: string) {
    setSections((list) => list.filter((s) => s.id !== sectionId));
    setCards((list) => list.filter((c) => c.sectionId !== sectionId));
    setPanelState(null);
  }

  const sectionOptions = sections.map((s) => ({ id: s.id, title: s.title }));

  return (
    <div className="board-canvas-wrap board-canvas-wrap-columns">
      <div ref={scrollAreaRef} className="columns-scroll-area">
        <div ref={columnsBoardRef} className="columns-board">
        {sections.map((section) => (
          <ColumnView
            key={section.id}
            section={{ id: section.id, title: section.title }}
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
            onSectionDragStart={(id) => setDraggingSectionId(id)}
            onSectionDragEnd={() => setDraggingSectionId(null)}
            onCardDragStart={handleDragStart}
            onCardDragEnd={handleDragEnd}
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
            onAddInColumn={() => setAddForSection(section.id)}
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
                onClick={handleSeedFromStudents}
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
          onSave={handleEditCardSave}
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
        // 상세 모달 좌/우 네비게이션이 보드 전체 카드를 순환하지 않고 같은
        // 섹션(칼럼) 내 카드만, 화면에 보이는 정렬 순서대로 순환하도록 필터.
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
