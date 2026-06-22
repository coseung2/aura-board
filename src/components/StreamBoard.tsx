"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { AddCardData } from "./AddCardModal";
import type { CardData } from "./DraggableCard";
import { SectionActionsPanel } from "./SectionActionsPanel";
import { StreamComposer } from "./stream/StreamComposer";
import { StreamActivityTemplatePanel } from "./stream/StreamActivityTemplatePanel";
import { StreamPost } from "./stream/StreamPost";
import { useCardRealtime } from "@/hooks/useCardRealtime";
import { sortSections } from "@/lib/sort-sections";
import {
  STREAM_ACTIVITY_TEMPLATE_LABELS,
  STREAM_ACTIVITY_TEMPLATES,
  type StreamActivityTemplate,
} from "@/lib/stream-activity-templates";
import {
  useBoardSlideshow,
  type SlideshowSlide,
} from "./slideshow/BoardSlideshowProvider";

export type StreamSection = {
  id: string;
  title: string;
  order: number;
  pinned: boolean;
  activityTemplate?: StreamActivityTemplate | null;
};

type Props = {
  boardId: string;
  initialCards: CardData[];
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  isStudentViewer?: boolean;
  classroomId?: string | null;
  streamTitlePrompt?: string;
  streamContentPrompt?: string;
  initialSections?: StreamSection[];
  streamSectionsEnabled?: boolean;
};

export function StreamBoard({
  boardId,
  initialCards,
  currentUserId,
  currentRole,
  isStudentViewer,
  streamTitlePrompt,
  streamContentPrompt,
  initialSections = [],
  streamSectionsEnabled = false,
}: Props) {
  const [cards, setCards] = useState<CardData[]>(() => sortPosts(initialCards));
  const [sections, setSections] = useState<StreamSection[]>(() =>
    [...initialSections].sort(sortSections),
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelState, setPanelState] = useState<{
    sectionId: string;
    tab: "rename" | "delete";
  } | null>(null);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [sectionAddBusy, setSectionAddBusy] = useState(false);
  const [sectionAddError, setSectionAddError] = useState<string | null>(null);
  const [templateBusySectionId, setTemplateBusySectionId] = useState<string | null>(null);
  const canEdit = currentRole === "owner" || currentRole === "editor";
  const canAddPost = canEdit || !!isStudentViewer;

  // Track in-flight deletions so polled snapshots don't resurrect them.
  const deletingIds = useRef<Set<string>>(new Set());

  // ── Realtime polling ──────────────────────────────────────────────
  useCardRealtime(boardId, setCards, deletingIds);

  useEffect(() => {
    setMounted(true);
  }, []);

  const sortedSections = useMemo(
    () => [...sections].sort(sortSections),
    [sections],
  );

  // Group cards by section. Unsectioned cards (null/unknown sectionId)
  // land in the "" bucket, rendered last as "섹션 없음".
  const grouped = useMemo(() => {
    const bySection = new Map<string, CardData[]>();
    const unsectioned: CardData[] = [];
    const knownIds = new Set(sortedSections.map((s) => s.id));
    for (const card of cards) {
      const sid = card.sectionId ?? null;
      if (sid && knownIds.has(sid)) {
        const bucket = bySection.get(sid);
        if (bucket) bucket.push(card);
        else bySection.set(sid, [card]);
      } else {
        unsectioned.push(card);
      }
    }
    return { bySection, unsectioned };
  }, [cards, sortedSections]);

  const sectionOptions = useMemo(
    () => sortedSections.map((s) => ({ id: s.id, title: s.title })),
    [sortedSections],
  );

  // Register the sorted feed as slideshow slides so the board header
  // button can open a presentation overlay. When sections are enabled,
  // insert a section-title slide before each section group.
  const { registerSlides, unregisterSlides } = useBoardSlideshow();
  useEffect(() => {
    const slides: SlideshowSlide[] = [];
    if (streamSectionsEnabled) {
      for (const section of sortedSections) {
        const bucket = grouped.bySection.get(section.id) ?? [];
        slides.push({
          id: `section:${section.id}`,
          kind: "section",
          sectionId: section.id,
          sectionTitle: section.title,
        });
        for (const card of bucket) slides.push({ id: card.id, kind: "card", card });
      }
      if (grouped.unsectioned.length > 0) {
        slides.push({
          id: "section:none",
          kind: "section",
          sectionId: null,
          sectionTitle: "섹션 없음",
        });
        for (const card of grouped.unsectioned) {
          slides.push({ id: card.id, kind: "card", card });
        }
      }
    } else {
      for (const card of cards) slides.push({ id: card.id, kind: "card", card });
    }
    registerSlides("stream", slides);
    return () => {
      unregisterSlides("stream");
    };
  }, [cards, sortedSections, grouped, streamSectionsEnabled, registerSlides, unregisterSlides]);

  async function handleAdd(data: AddCardData) {
    const res = await fetch("/api/cards", {
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
        x: 0,
        y: 0,
        order: cards.length,
        sectionId: data.sectionId ?? null,
      }),
    });
    if (!res.ok) {
      alert(`게시글 작성에 실패했어요: ${await res.text()}`);
      throw new Error("Failed to create stream post");
    }
    const { card } = (await res.json()) as { card: CardData };
    setCards((prev) => sortPosts([card, ...prev]));
  }

  async function handleDelete(card: CardData) {
    if (!window.confirm("게시글을 삭제할까요?")) return;
    deletingIds.current.add(card.id);
    const prev = cards;
    setCards((list) => list.filter((item) => item.id !== card.id));
    try {
      const res = await fetch(`/api/cards/${card.id}`, { method: "DELETE" });
      if (!res.ok) {
        deletingIds.current.delete(card.id);
        setCards(prev);
      }
    } catch {
      deletingIds.current.delete(card.id);
      setCards(prev);
    }
  }

  function startAddSection() {
    setIsAddingSection(true);
    setSectionAddError(null);
  }

  function cancelAddSection() {
    if (sectionAddBusy) return;
    setIsAddingSection(false);
    setNewSectionTitle("");
    setSectionAddError(null);
  }

  async function handleAddSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newSectionTitle.trim();
    if (!title) {
      setSectionAddError("섹션 이름을 입력하세요.");
      return;
    }

    setSectionAddBusy(true);
    setSectionAddError(null);
    try {
      const res = await fetch("/api/sections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId, title }),
      });
      if (!res.ok) {
        setSectionAddError("섹션 추가에 실패했어요.");
        return;
      }
      const { section } = (await res.json()) as { section: StreamSection };
      setSections((prev) => [...prev, section].sort(sortSections));
      setNewSectionTitle("");
      setIsAddingSection(false);
    } catch {
      setSectionAddError("섹션 추가에 실패했어요.");
    } finally {
      setSectionAddBusy(false);
    }
  }

  function handleSectionRenamed(sectionId: string, newTitle: string) {
    setSections((list) =>
      list.map((s) => (s.id === sectionId ? { ...s, title: newTitle } : s)),
    );
  }

  function handleSectionDeleted(sectionId: string) {
    setSections((list) => list.filter((s) => s.id !== sectionId));
    setCards((list) => list.filter((c) => c.sectionId !== sectionId));
  }

  async function handleSectionTemplateChange(
    sectionId: string,
    activityTemplate: StreamActivityTemplate | null,
  ) {
    setTemplateBusySectionId(sectionId);
    const prev = sections;
    setSections((list) =>
      list.map((s) => (s.id === sectionId ? { ...s, activityTemplate } : s)),
    );
    try {
      const res = await fetch(`/api/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityTemplate }),
      });
      if (!res.ok) {
        setSections(prev);
        alert("활동 템플릿 저장에 실패했어요.");
        return;
      }
      const { section } = (await res.json()) as { section: StreamSection };
      setSections((list) =>
        list.map((s) =>
          s.id === section.id
            ? { ...s, activityTemplate: section.activityTemplate ?? null }
            : s,
        ),
      );
    } catch {
      setSections(prev);
      alert("활동 템플릿 저장에 실패했어요.");
    } finally {
      setTemplateBusySectionId(null);
    }
  }

  const showComposerSections =
    streamSectionsEnabled && sectionOptions.length > 0;

  return (
    <div className="board-canvas-wrap stream-board-wrap">
      <div className="stream-feed">
        {cards.length === 0 && !streamSectionsEnabled ? (
          <div className="stream-empty">
            {canAddPost ? "첫 게시글을 남겨보세요." : "아직 게시글이 없어요."}
          </div>
        ) : streamSectionsEnabled ? (
          <StreamGroupedFeed
            sections={sortedSections}
            grouped={grouped}
            boardId={boardId}
            canEdit={canEdit}
            currentUserId={currentUserId}
            currentRole={currentRole}
            canAddPost={canAddPost}
            isAddingSection={isAddingSection}
            newSectionTitle={newSectionTitle}
            sectionAddBusy={sectionAddBusy}
            sectionAddError={sectionAddError}
            onStartAddSection={startAddSection}
            onCancelAddSection={cancelAddSection}
            onSectionTitleChange={setNewSectionTitle}
            onSubmitSection={handleAddSection}
            onOpenSectionPanel={(sectionId, tab) =>
              setPanelState({ sectionId, tab })
            }
            onSectionTemplateChange={handleSectionTemplateChange}
            templateBusySectionId={templateBusySectionId}
            onDeleteCard={handleDelete}
          />
        ) : (
          cards.map((card) => (
            <StreamPost
              key={card.id}
              card={card}
              canDelete={canDeleteCard(card, currentUserId, currentRole)}
              onDelete={() => handleDelete(card)}
              boardId={boardId}
            />
          ))
        )}
      </div>
      {canAddPost && (
        <>
          <button
            type="button"
            className="add-card-fab"
            onClick={() => setComposerOpen(true)}
            aria-label="게시글 작성"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          {mounted &&
            composerOpen &&
            createPortal(
              <>
                <div
                  className="modal-backdrop"
                  onClick={() => setComposerOpen(false)}
                />
                <div
                  className="add-card-modal stream-composer-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="stream-composer-modal-title"
                >
                  <div className="modal-header">
                    <h2 className="modal-title" id="stream-composer-modal-title">
                      게시글 작성
                    </h2>
                    <button
                      type="button"
                      className="modal-close"
                      onClick={() => setComposerOpen(false)}
                      aria-label="닫기"
                    >
                      ×
                    </button>
                  </div>
                  <div className="modal-body">
                    <StreamComposer
                      onAdd={handleAdd}
                      onSubmitted={() => setComposerOpen(false)}
                      streamTitlePrompt={streamTitlePrompt}
                      streamContentPrompt={streamContentPrompt}
                      sections={showComposerSections ? sectionOptions : undefined}
                    />
                  </div>
                </div>
              </>,
              document.body,
            )}
        </>
      )}

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
    </div>
  );
}

type StreamGroupedFeedProps = {
  sections: StreamSection[];
  grouped: { bySection: Map<string, CardData[]>; unsectioned: CardData[] };
  boardId: string;
  canEdit: boolean;
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  canAddPost: boolean;
  isAddingSection: boolean;
  newSectionTitle: string;
  sectionAddBusy: boolean;
  sectionAddError: string | null;
  onStartAddSection: () => void;
  onCancelAddSection: () => void;
  onSectionTitleChange: (title: string) => void;
  onSubmitSection: (event: FormEvent<HTMLFormElement>) => void;
  onOpenSectionPanel: (sectionId: string, tab: "rename" | "delete") => void;
  onSectionTemplateChange: (
    sectionId: string,
    activityTemplate: StreamActivityTemplate | null,
  ) => void;
  templateBusySectionId: string | null;
  onDeleteCard: (card: CardData) => void;
};

function StreamGroupedFeed({
  sections,
  grouped,
  boardId,
  canEdit,
  currentUserId,
  currentRole,
  canAddPost,
  isAddingSection,
  newSectionTitle,
  sectionAddBusy,
  sectionAddError,
  onStartAddSection,
  onCancelAddSection,
  onSectionTitleChange,
  onSubmitSection,
  onOpenSectionPanel,
  onSectionTemplateChange,
  templateBusySectionId,
  onDeleteCard,
}: StreamGroupedFeedProps) {
  const hasAnyCard =
    grouped.unsectioned.length > 0 ||
    sections.some((s) => (grouped.bySection.get(s.id) ?? []).length > 0);

  return (
    <>
      {canEdit && (
        <div className="stream-section-add-row">
          {isAddingSection ? (
            <form className="stream-section-add-form" onSubmit={onSubmitSection}>
              <input
                type="text"
                value={newSectionTitle}
                onChange={(event) => onSectionTitleChange(event.target.value)}
                placeholder="섹션 이름"
                className="stream-section-add-input"
                maxLength={80}
                autoFocus
                disabled={sectionAddBusy}
              />
              <button
                type="submit"
                className="stream-section-add-submit"
                disabled={sectionAddBusy}
              >
                추가
              </button>
              <button
                type="button"
                className="stream-section-add-cancel"
                onClick={onCancelAddSection}
                disabled={sectionAddBusy}
              >
                취소
              </button>
              {sectionAddError && (
                <span className="stream-section-add-error" role="alert">
                  {sectionAddError}
                </span>
              )}
            </form>
          ) : (
            <button
              type="button"
              className="column-add-btn stream-section-add-btn"
              onClick={onStartAddSection}
            >
              + 섹션 추가
            </button>
          )}
        </div>
      )}

      {sections.map((section) => {
        const bucket = grouped.bySection.get(section.id) ?? [];
        return (
          <section key={section.id} className="stream-section-group">
            <header className="stream-section-header">
              <div className="stream-section-heading">
                <h2 className="stream-section-title">{section.title}</h2>
                {section.activityTemplate && (
                  <span className="stream-section-template-badge">
                    {STREAM_ACTIVITY_TEMPLATE_LABELS[section.activityTemplate]}
                  </span>
                )}
              </div>
              {canEdit && (
                <div className="stream-section-menu">
                  <select
                    className="stream-section-template-select"
                    value={section.activityTemplate ?? ""}
                    onChange={(event) =>
                      onSectionTemplateChange(
                        section.id,
                        event.target.value
                          ? (event.target.value as StreamActivityTemplate)
                          : null,
                      )
                    }
                    disabled={templateBusySectionId === section.id}
                    aria-label={`${section.title} 활동 템플릿`}
                  >
                    <option value="">일반 섹션</option>
                    {STREAM_ACTIVITY_TEMPLATES.map((template) => (
                      <option key={template} value={template}>
                        {STREAM_ACTIVITY_TEMPLATE_LABELS[template]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="stream-section-menu-toggle"
                    aria-label="섹션 옵션"
                    onClick={() => onOpenSectionPanel(section.id, "rename")}
                  >
                    ⋯
                  </button>
                </div>
              )}
            </header>
            {section.activityTemplate && (
              <StreamActivityTemplatePanel
                template={section.activityTemplate}
                sectionId={section.id}
                cards={bucket}
                canEdit={canAddPost}
              />
            )}
            {bucket.length === 0 ? (
              <div className="stream-section-empty">아직 게시글이 없어요.</div>
            ) : (
              bucket.map((card) => (
                <StreamPost
                  key={card.id}
                  card={card}
                  canDelete={canDeleteCard(card, currentUserId, currentRole)}
                  onDelete={() => onDeleteCard(card)}
                  boardId={boardId}
                />
              ))
            )}
          </section>
        );
      })}

      {grouped.unsectioned.length > 0 && (
        <section className="stream-section-group stream-section-group-unsectioned">
          <header className="stream-section-header">
            <h2 className="stream-section-title">섹션 없음</h2>
          </header>
          {grouped.unsectioned.map((card) => (
            <StreamPost
              key={card.id}
              card={card}
              canDelete={canDeleteCard(card, currentUserId, currentRole)}
              onDelete={() => onDeleteCard(card)}
              boardId={boardId}
            />
          ))}
        </section>
      )}

      {!hasAnyCard && !canEdit && (
        <div className="stream-empty">아직 게시글이 없어요.</div>
      )}
      {!hasAnyCard && canEdit && canAddPost && (
        <div className="stream-empty">첫 게시글을 남겨보세요.</div>
      )}
    </>
  );
}

function sortPosts(cards: CardData[]): CardData[] {
  return [...cards].sort((a, b) => {
    const byCreatedAt =
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    return byCreatedAt || b.order - a.order;
  });
}

function canDeleteCard(
  card: CardData,
  currentUserId: string,
  currentRole: "owner" | "editor" | "viewer",
): boolean {
  if (currentRole === "owner") return true;
  if (currentRole === "editor" && card.authorId === currentUserId) return true;
  return card.studentAuthorId === currentUserId;
}
