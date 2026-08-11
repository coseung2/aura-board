"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CardDetailModal } from "./cards/CardDetailModal";
import type { CardData } from "./DraggableCard";
import { EditCardModal, type EditCardUpdates } from "./EditCardModal";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GroupIcon,
  PencilIcon,
  SlideshowIcon,
  TemplateIcon,
  TrashIcon,
  WritingGuideIcon,
} from "./icons/UiIcons";
import { SectionActionsPanel } from "./SectionActionsPanel";
import { StreamComposer } from "./stream/StreamComposer";
import { StreamPost } from "./stream/StreamPost";
import {
  ActivityTemplateModal,
  SectionWritingPromptModal,
} from "./stream/StreamSectionModals";
import { BreakoutConfigModal } from "./stream/StreamBreakoutConfigModal";
import { useBoardAnonymityChange } from "@/hooks/useBoardAnonymityChange";
import { useCardRealtime } from "@/hooks/useCardRealtime";
import {
  withBoardAnonymousAuthor,
  withBoardAnonymousAuthors,
} from "@/lib/card-anonymity";
import { sortSections } from "@/lib/sort-sections";
import {
  useBoardSlideshow,
  type SlideshowSectionOption,
  type SlideshowSlide,
} from "./slideshow/BoardSlideshowProvider";

import {
  buildBreakoutStateFromSection,
  buildInitialBreakoutState,
  buildSectionContentItems,
  canDeleteCard,
  canToggleGuideCard,
  cardHasAnyStudentAuthor,
  cardHasStudentAuthor,
  formatBreakoutMemberName,
  getGroupIdForCardAuthors,
  getSectionWritingGuidance,
  getSlideshowCards,
  isGuideCard,
  isSectionSlideshowEnabled,
  normalizeBreakoutStateForViewer,
  resolveCardBreakoutGroupId,
  sortPosts,
} from "./stream/stream-board-model";
import type {
  BreakoutGroup,
  BreakoutState,
  StreamContentItem,
  StreamSection,
} from "./stream/stream-board-model";
import { createStreamBoardSectionActions } from "./stream/stream-board-section-actions";
import { createStreamBoardCardActions } from "./stream/stream-board-card-actions";
import { StreamGroupedFeed } from "./stream/StreamGroupedFeed";
export type {
  BreakoutConfig,
  BreakoutGroup,
  BreakoutGroupMember,
  BreakoutState,
  StreamSection,
} from "./stream/stream-board-model";
type Props = {
  boardId: string;
  initialCards: CardData[];
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  isStudentViewer?: boolean;
  currentStudentName?: string | null;
  classroomId?: string | null;
  streamTitlePrompt?: string;
  streamContentPrompt?: string;
  initialSections?: StreamSection[];
  streamSectionsEnabled?: boolean;
  anonymousAuthor?: boolean;
};

export function StreamBoard({
  boardId,
  initialCards,
  currentUserId,
  currentRole,
  isStudentViewer,
  currentStudentName,
  classroomId,
  streamTitlePrompt,
  streamContentPrompt,
  initialSections = [],
  streamSectionsEnabled = false,
  anonymousAuthor = false,
}: Props) {
  const [cards, setCards] = useState<CardData[]>(() =>
    withBoardAnonymousAuthors(sortPosts(initialCards), anonymousAuthor),
  );
  const [sections, setSections] = useState<StreamSection[]>(() =>
    [...initialSections].sort(sortSections),
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerSectionId, setComposerSectionId] = useState<string | null>(null);
  const [composerGroupId, setComposerGroupId] = useState<string | null>(null);
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
  const [templateModalSectionId, setTemplateModalSectionId] = useState<string | null>(null);
  const [sectionSlideshowBusyId, setSectionSlideshowBusyId] = useState<string | null>(null);
  const [sectionPromptBusyId, setSectionPromptBusyId] = useState<string | null>(null);
  const [sectionPromptModalId, setSectionPromptModalId] = useState<string | null>(null);
  const [sectionOrderBusyId, setSectionOrderBusyId] = useState<string | null>(null);
  const [contentOrderBusyId, setContentOrderBusyId] = useState<string | null>(null);
  const [guideBusyId, setGuideBusyId] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<CardData | null>(null);
  const [editingCard, setEditingCard] = useState<CardData | null>(null);
  const canEdit = currentRole === "owner" || currentRole === "editor";
  const canManageSections = canEdit && !isStudentViewer;
  const canAddPost = canEdit || !!isStudentViewer;
  const [breakoutBySection, setBreakoutBySection] = useState<Record<string, BreakoutState>>(() =>
    buildInitialBreakoutState(initialSections, canManageSections),
  );
  const [breakoutBusyId, setBreakoutBusyId] = useState<string | null>(null);
  const [breakoutModalSectionId, setBreakoutModalSectionId] = useState<string | null>(null);
  const [activeGroupBySection, setActiveGroupBySection] = useState<Record<string, string>>({});
  const breakoutViewerKey = `${isStudentViewer ? "student" : "user"}:${currentUserId}`;
  // Track which sections we've already fetched breakout for so a poll or
  // re-render does not re-trigger the GET.
  const breakoutLoadedRef = useRef<Set<string>>(new Set());

  // Track in-flight deletions so polled snapshots don't resurrect them.
  const deletingIds = useRef<Set<string>>(new Set());

  // ── Realtime polling ──────────────────────────────────────────────
  useCardRealtime(boardId, setCards, deletingIds, setSections, !!isStudentViewer);

  const applyAnonymousAuthor = useCallback((next: boolean) => {
    setCards((list) => withBoardAnonymousAuthors(list, next));
    setOpenCard((card) => withBoardAnonymousAuthor(card, next));
    setEditingCard((card) => withBoardAnonymousAuthor(card, next));
  }, []);

  useEffect(() => {
    applyAnonymousAuthor(anonymousAuthor);
  }, [anonymousAuthor, applyAnonymousAuthor]);

  useBoardAnonymityChange(boardId, applyAnonymousAuthor);

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

  useEffect(() => {
    if (!streamSectionsEnabled) return;
    breakoutLoadedRef.current.clear();
    setBreakoutBySection(buildInitialBreakoutState(sortedSections, canManageSections));
    setActiveGroupBySection({});
  }, [breakoutViewerKey, streamSectionsEnabled, sortedSections, canManageSections]);

  // Load breakout state for each section from the dedicated endpoint. The
  // page server component stays unaware of breakout; this client fetch is
  // the source of truth for config, groups, membership and canManage.
  useEffect(() => {
    if (!streamSectionsEnabled) return;
    let alive = true;
    for (const section of sortedSections) {
      if (breakoutLoadedRef.current.has(section.id)) continue;
      breakoutLoadedRef.current.add(section.id);
      fetch(`/api/sections/${section.id}/breakout`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!alive || !data) return;
          const state = normalizeBreakoutStateForViewer(
            data as BreakoutState,
            !!isStudentViewer,
          );
          setBreakoutBySection((prev) => ({ ...prev, [section.id]: state }));
          setActiveGroupBySection((prev) =>
            state.canManage && prev[section.id] !== undefined
              ? prev
              : {
                  ...prev,
                  [section.id]: state.canManage
                    ? "all"
                    : (state.membership?.groupId ?? "all"),
                },
          );
        })
        .catch(() => {
          breakoutLoadedRef.current.delete(section.id);
        });
    }
    return () => {
      alive = false;
    };
  }, [sortedSections, streamSectionsEnabled, isStudentViewer, breakoutViewerKey]);

  function visibleCardsForSection(sectionId: string, bucket: CardData[]): CardData[] {
    const bs = breakoutBySection[sectionId];
    if (!bs || !bs.config) return bucket;
    if (!bs.canManage) {
      // Students only see their own group; before joining, nothing.
      if (!bs.membership) return [];
      return bucket.filter(
        (c) => resolveCardBreakoutGroupId(c, bs.groups) === bs.membership!.groupId,
      );
    }
    const active = activeGroupBySection[sectionId] ?? "all";
    if (active === "all") return bucket;
    return bucket.filter((c) => resolveCardBreakoutGroupId(c, bs.groups) === active);
  }

  // Cards each viewer is allowed to see per section — drives both the
  // grouped feed and the slideshow so a student's group view never leaks
  // other groups' cards into the presentation bucket.
  const visibleBySection = useMemo(() => {
    const map = new Map<string, CardData[]>();
    for (const section of sortedSections) {
      map.set(section.id, visibleCardsForSection(section.id, grouped.bySection.get(section.id) ?? []));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedSections, grouped, breakoutBySection, activeGroupBySection]);

  function getStreamDetailCards(card: CardData): CardData[] {
    if (!streamSectionsEnabled) return cards;

    const sectionId = card.sectionId ?? null;
    if (!sectionId) return grouped.unsectioned;

    const bucket = grouped.bySection.get(sectionId) ?? [];
    if (isGuideCard(card)) {
      return bucket.filter(isGuideCard);
    }

    const postBucket = bucket.filter((candidate) => !isGuideCard(candidate));
    const breakout = breakoutBySection[sectionId];
    if (!breakout?.config) return postBucket;

    const cardGroupId = resolveCardBreakoutGroupId(card, breakout.groups);
    if (!breakout.canManage) {
      const groupId = breakout.membership?.groupId ?? cardGroupId;
      return postBucket.filter(
        (candidate) =>
          resolveCardBreakoutGroupId(candidate, breakout.groups) === groupId,
      );
    }

    const activeGroup = activeGroupBySection[sectionId] ?? "all";
    if (activeGroup === "all") return postBucket;
    const groupId = activeGroup || cardGroupId;
    return postBucket.filter(
      (candidate) =>
        resolveCardBreakoutGroupId(candidate, breakout.groups) === groupId,
    );
  }

  const detailCards = openCard ? getStreamDetailCards(openCard) : [];
  const openCardIndex = openCard
    ? detailCards.findIndex((card) => card.id === openCard.id)
    : -1;
  const previousOpenCard =
    openCardIndex > 0 ? detailCards[openCardIndex - 1] : null;
  const nextOpenCard =
    openCardIndex >= 0 && openCardIndex < detailCards.length - 1
      ? detailCards[openCardIndex + 1]
      : null;

  useEffect(() => {
    setOpenCard((current) => {
      if (!current) return current;
      return cards.find((card) => card.id === current.id) ?? null;
    });
  }, [cards]);

  const sectionOptions = useMemo(
    () =>
      sortedSections.map((section) => {
        const guidance = getSectionWritingGuidance(section);
        return {
          id: section.id,
          title: section.title,
          streamTitlePrompt: guidance.titlePrompt,
          streamContentPrompt: guidance.contentPrompt,
        };
      }),
    [sortedSections],
  );

  // Register the sorted feed as slideshow slides so the board header
  // button can open a presentation overlay. When sections are enabled,
  // insert a section-title slide before each section group.
  const { registerSlides, unregisterSlides, setSectionOptions } =
    useBoardSlideshow();
  useEffect(() => {
	    const slides: SlideshowSlide[] = [];
	    if (streamSectionsEnabled) {
      for (const section of sortedSections) {
        if (!isSectionSlideshowEnabled(section)) continue;
        const bucket = getSlideshowCards(visibleBySection.get(section.id) ?? []);
        const contentItems = buildSectionContentItems(section, bucket);
        slides.push({
          id: `section:${section.id}`,
          kind: "section",
          sectionId: section.id,
          sectionTitle: section.title,
        });
        for (const item of contentItems) {
          if (item.kind === "template" && section.activityTemplate) {
            slides.push({
              id: `activity:${section.id}:${section.activityTemplate}`,
              kind: "activity",
              sectionId: section.id,
              sectionTitle: section.title,
              activityTemplate: section.activityTemplate,
              activityTemplateState: section.activityTemplateState ?? null,
              cards: bucket,
            });
            continue;
          }
          if (item.kind === "card") {
            slides.push({ id: item.card.id, kind: "card", card: item.card });
          }
        }
      }
      const unsectionedSlides = getSlideshowCards(grouped.unsectioned);
      if (unsectionedSlides.length > 0) {
        slides.push({
          id: "section:none",
          kind: "section",
          sectionId: null,
          sectionTitle: "섹션 없음",
        });
        for (const card of unsectionedSlides) {
          slides.push({ id: card.id, kind: "card", card });
        }
      }
    } else {
      for (const card of getSlideshowCards(cards)) {
        slides.push({ id: card.id, kind: "card", card });
      }
    }
    registerSlides("stream", slides);
    return () => {
      unregisterSlides("stream");
    };
  }, [cards, sortedSections, visibleBySection, streamSectionsEnabled, registerSlides, unregisterSlides]);

  useEffect(() => {
    if (!streamSectionsEnabled) {
      setSectionOptions("stream", []);
      return;
    }
	    const options: SlideshowSectionOption[] = sortedSections
	      .filter(isSectionSlideshowEnabled)
	      .map((section) => {
        const state = breakoutBySection[section.id];
        const groups = state?.config
          ? [...state.groups]
              .sort((a, b) => a.order - b.order)
              .map((group) => ({
                groupId: group.id,
                name: group.name,
                memberStudentIds: (group.members ?? []).map((member) => member.studentId),
              }))
          : [];
        return {
          sectionId: section.id,
          title: section.title,
          groups,
          defaultGroupId:
            state?.config && !state.canManage
              ? state.membership?.groupId ?? null
              : null,
        };
      })
      .filter((option) => option.groups.length > 0);
    setSectionOptions("stream", options);
  }, [
    sortedSections,
    breakoutBySection,
    streamSectionsEnabled,
    setSectionOptions,
  ]);

  const cardActions = createStreamBoardCardActions({
    boardId, composerGroupId, isStudentViewer, cards, openCard, editingCard,
    breakoutBySection, newSectionTitle, sectionAddBusy, deletingIds, setCards, setSections,
    setOpenCard, setIsAddingSection, setNewSectionTitle, setSectionAddBusy, setSectionAddError,
  });
  const {
    handleAdd,
    handleDelete,
    handleEditCardSave,
    startAddSection,
    cancelAddSection,
    handleAddSection,
  } = cardActions;
  const sectionActions = createStreamBoardSectionActions({
    currentUserId, isStudentViewer, cards, sections, breakoutBySection,
    sectionSlideshowBusyId, sectionPromptBusyId,
    setCards, setSections, setTemplateBusySectionId,
    setSectionSlideshowBusyId, setSectionPromptBusyId, setSectionOrderBusyId,
    setContentOrderBusyId, setGuideBusyId, setBreakoutBusyId, setBreakoutBySection,
    setActiveGroupBySection,
  });
  const {
    handleSectionRenamed,
    handleSectionDeleted,
    handleSectionTemplateChange,
    handleSectionWritingGuidanceSave,
    handleSaveBreakout,
    handleDisableBreakout,
  } = sectionActions;
  const showComposerSections =
    streamSectionsEnabled && sectionOptions.length > 0;

  function openComposer(sectionId?: string | null, groupId?: string | null) {
    setComposerSectionId(sectionId ?? null);
    setComposerGroupId(groupId ?? null);
    setComposerOpen(true);
  }

  async function handleRemoveBreakoutMember(
    sectionId: string,
    membershipId: string,
  ): Promise<boolean> {
    const prevState = breakoutBySection[sectionId];
    if (!prevState) return false;
    setBreakoutBusyId(sectionId);
    try {
      const res = await fetch(`/api/sections/${sectionId}/breakout/membership`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ membershipId }),
      });
      if (!res.ok) {
        alert("모둠원 내보내기에 실패했어요.");
        return false;
      }
      const data = normalizeBreakoutStateForViewer(
        (await res.json()) as BreakoutState,
        !!isStudentViewer,
      );
      const removedMember = prevState.groups
        .flatMap((group) =>
          (group.members ?? []).map((member) => ({
            ...member,
            groupId: group.id,
          })),
        )
        .find((member) => member.id === membershipId);
      setBreakoutBySection((prev) => ({ ...prev, [sectionId]: data }));
      if (removedMember) {
        setCards((prev) =>
          prev.map((card) =>
            card.sectionId === sectionId &&
            cardHasStudentAuthor(card, removedMember.studentId) &&
            card.groupId === removedMember.groupId
              ? { ...card, groupId: null }
              : card,
          ),
        );
      }
      return true;
    } catch {
      alert("모둠원 내보내기에 실패했어요.");
      return false;
    } finally {
      setBreakoutBusyId(null);
    }
  }

  function closeComposer() {
    setComposerOpen(false);
    setComposerSectionId(null);
    setComposerGroupId(null);
  }

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
            viewer={{
              boardId,
              canEdit: canManageSections,
              currentUserId,
              currentRole,
              canAddPost,
              isStudentViewer,
              currentStudentName,
            }}
            sectionCreation={{
              isAdding: isAddingSection,
              title: newSectionTitle,
              busy: sectionAddBusy,
              error: sectionAddError,
              onStart: startAddSection,
              onCancel: cancelAddSection,
              onTitleChange: setNewSectionTitle,
              onSubmit: handleAddSection,
            }}
            sectionUi={{
              onOpenPanel: (sectionId, tab) => setPanelState({ sectionId, tab }),
              onOpenPromptModal: setSectionPromptModalId,
              onOpenTemplateModal: setTemplateModalSectionId,
              onOpenBreakoutModal: setBreakoutModalSectionId,
              onOpenComposer: openComposer,
            }}
            sectionActions={sectionActions}
            busy={{
              templateSectionId: templateBusySectionId,
              slideshowSectionId: sectionSlideshowBusyId,
              promptSectionId: sectionPromptBusyId,
              sectionOrder: sectionOrderBusyId,
              contentOrder: contentOrderBusyId,
              guideCardId: guideBusyId,
            }}
            breakout={{
              stateBySection: breakoutBySection,
              activeGroupBySection,
              busySectionId: breakoutBusyId,
              onSetActiveGroup: (sectionId, group) =>
                setActiveGroupBySection((prev) => ({ ...prev, [sectionId]: group })),
              onRemoveMember: handleRemoveBreakoutMember,
            }}
            cardActions={cardActions}
            cardUi={{ onEdit: setEditingCard, onOpen: setOpenCard }}
          />
        ) : (
          <div className="stream-post-grid">
            {cards.map((card) => (
              <StreamPost
                key={card.id}
                card={card}
                canEdit={canDeleteCard(card, currentUserId, currentRole)}
                onEdit={() => setEditingCard(card)}
                canDelete={canDeleteCard(card, currentUserId, currentRole)}
                onDelete={() => handleDelete(card)}
                canToggleGuide={canToggleGuideCard(card, canManageSections)}
                guideBusy={guideBusyId === card.id}
                onToggleGuide={(guidePinned) => handleToggleGuide(card, guidePinned)}
                onOpen={() => setOpenCard(card)}
                boardId={boardId}
                isStudentViewer={!!isStudentViewer}
              />
            ))}
          </div>
        )}
      </div>
      {canAddPost && (
        <>
          <button
            type="button"
            className="add-card-fab"
            onClick={() => openComposer(null)}
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
                  onClick={closeComposer}
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
                      onClick={closeComposer}
                      aria-label="닫기"
                    >
                      ×
                    </button>
                  </div>
                  <div className="modal-body">
                    <StreamComposer
                      onAdd={handleAdd}
                      onSubmitted={closeComposer}
                      streamTitlePrompt={streamTitlePrompt}
                      streamContentPrompt={streamContentPrompt}
                      sections={showComposerSections ? sectionOptions : undefined}
                      initialSectionId={composerSectionId ?? undefined}
                      canConfigurePoll={canEdit || !!isStudentViewer}
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

	      {mounted &&
	        templateModalSectionId &&
	        (() => {
	          const section = sections.find((s) => s.id === templateModalSectionId);
	          if (!section) return null;
          return createPortal(
            <ActivityTemplateModal
              section={section}
              busy={templateBusySectionId === section.id}
              onClose={() => setTemplateModalSectionId(null)}
              onApply={async (template) => {
                const ok = await handleSectionTemplateChange(section.id, template);
                if (ok) setTemplateModalSectionId(null);
              }}
            />,
	            document.body,
	          );
	        })()}
	      {mounted &&
	        sectionPromptModalId &&
	        (() => {
	          const section = sections.find((s) => s.id === sectionPromptModalId);
	          if (!section) return null;
	          const guidance = getSectionWritingGuidance(section);
	          return createPortal(
	            <SectionWritingPromptModal
	              section={section}
	              initialTitlePrompt={guidance.titlePrompt}
	              initialContentPrompt={guidance.contentPrompt}
	              busy={sectionPromptBusyId === section.id}
	              onClose={() => setSectionPromptModalId(null)}
	              onSave={async (prompts) => {
	                const ok = await handleSectionWritingGuidanceSave(section, prompts);
	                if (ok) setSectionPromptModalId(null);
	              }}
	            />,
	            document.body,
	          );
	        })()}
	      {mounted &&
	        breakoutModalSectionId &&
        (() => {
          const section = sections.find((s) => s.id === breakoutModalSectionId);
          if (!section) return null;
          const state = breakoutBySection[section.id];
          return createPortal(
            <BreakoutConfigModal
              boardId={boardId}
              section={section}
              state={state}
              busy={breakoutBusyId === section.id}
              onClose={() => setBreakoutModalSectionId(null)}
              onSave={async (groups) => {
                const ok = await handleSaveBreakout(section.id, groups);
                if (ok) setBreakoutModalSectionId(null);
                return ok;
              }}
              onDisable={async () => {
                const ok = await handleDisableBreakout(section.id);
                if (ok) setBreakoutModalSectionId(null);
                return ok;
              }}
            />,
            document.body,
          );
        })()}
      {editingCard &&
        createPortal(
          <EditCardModal
            card={editingCard}
            onSave={handleEditCardSave}
            onClose={() => setEditingCard(null)}
            canConfigurePoll={canDeleteCard(editingCard, currentUserId, currentRole)}
          />,
          document.body,
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
        boardId={boardId}
        isStudentViewer={!!isStudentViewer}
      />
    </div>
  );
}
