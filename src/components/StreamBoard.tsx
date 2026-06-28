"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { AddCardData } from "./AddCardModal";
import { BoardTimerFab } from "./BoardTimerFab";
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
import { StreamActivityTemplatePanel } from "./stream/StreamActivityTemplatePanel";
import { StreamPost } from "./stream/StreamPost";
import {
  GroupRosterEditor,
  type GroupEditorDraft,
  type GroupEditorStudent,
} from "./classroom/GroupRosterEditor";
import { useCardRealtime } from "@/hooks/useCardRealtime";
import { sortSections } from "@/lib/sort-sections";
import {
  STREAM_ACTIVITY_TEMPLATE_LABELS,
  STREAM_ACTIVITY_TEMPLATES,
  normalizeStreamActivityTemplateState,
  type StreamActivityTemplate,
  type StreamActivityTemplateState,
} from "@/lib/stream-activity-templates";
import {
  useBoardSlideshow,
  type SlideshowSectionOption,
  type SlideshowSlide,
} from "./slideshow/BoardSlideshowProvider";

export type StreamSection = {
  id: string;
  title: string;
  order: number;
  pinned: boolean;
  activityTemplate?: StreamActivityTemplate | null;
  activityTemplateState?: StreamActivityTemplateState | null;
  breakout?: {
    groupCount: number;
    groupCapacity: number | null;
    joinMode: string;
    groups: BreakoutGroup[];
  } | null;
};

export type BreakoutGroup = {
  id: string;
  name: string;
  order: number;
  memberCount: number;
  members?: BreakoutGroupMember[];
};

export type BreakoutGroupMember = {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: number | null;
};

export type BreakoutConfig = {
  groupCount: number;
  groupCapacity: number | null;
  joinMode: "student_select" | "teacher_assign";
};

/** Per-section breakout state, fetched from
 *  GET /api/sections/[id]/breakout. The page server component does not
 *  denormalize breakout, so the stream board loads it client-side. */
export type BreakoutState = {
  config: BreakoutConfig | null;
  groups: BreakoutGroup[];
  membership: { groupId: string } | null;
  canManage: boolean;
};

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
};

type StreamContentItem =
  | { kind: "template"; id: string; order: number }
  | { kind: "card"; id: string; card: CardData; order: number };

export function StreamBoard({
  boardId,
  initialCards,
  currentUserId,
  currentRole,
  isStudentViewer,
  currentStudentName,
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
  useCardRealtime(boardId, setCards, deletingIds, setSections);

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

  async function handleAdd(data: AddCardData, groupId?: string | null) {
    const sectionId = data.sectionId ?? null;
    const requestedGroupId = groupId === undefined ? composerGroupId : groupId;
    const breakout = sectionId ? breakoutBySection[sectionId] : undefined;
    const effectiveGroupId =
      sectionId && breakout?.config
        ? !breakout.canManage
          ? breakout.membership?.groupId ?? null
          : requestedGroupId &&
              breakout.groups.some((group) => group.id === requestedGroupId)
            ? requestedGroupId
            : null
        : null;
    const siblingOrders = cards
      .filter(
        (card) =>
          (card.sectionId ?? null) === sectionId &&
          (card.groupId ?? null) === (effectiveGroupId ?? null),
      )
      .map((card) => card.order);
    const nextOrder =
      siblingOrders.length > 0 ? Math.max(...siblingOrders) + 1 : 0;
    const res = await fetch("/api/cards", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(isStudentViewer ? { "x-aura-student-viewer": "1" } : {}),
      },
      body: JSON.stringify({
        boardId,
        title: data.title,
        content: data.content,
        linkUrl: data.linkUrl || null,
        linkTitle: data.linkTitle || null,
        linkDesc: data.linkDesc || null,
        linkImage: data.linkImage || null,
        attachments: data.attachments,
        commentVoteOptionCount: data.commentVoteOptionCount ?? null,
        commentVoteOptionLabels: data.commentVoteOptionLabels ?? null,
        x: 0,
        y: 0,
        order: nextOrder,
        sectionId,
        groupId: effectiveGroupId ?? null,
      }),
    });
    if (!res.ok) {
      alert(`게시글 작성에 실패했어요: ${await res.text()}`);
      throw new Error("Failed to create stream post");
    }
    const { card } = (await res.json()) as { card: CardData };
    const visibleCard =
      effectiveGroupId && !card.groupId ? { ...card, groupId: effectiveGroupId } : card;
    setCards((prev) => sortPosts([visibleCard, ...prev]));
  }

  async function handleDelete(card: CardData) {
    if (!window.confirm("게시글을 삭제할까요?")) return;
    deletingIds.current.add(card.id);
    const prev = cards;
    const wasOpen = openCard?.id === card.id ? openCard : null;
    setCards((list) => list.filter((item) => item.id !== card.id));
    setOpenCard((current) => (current?.id === card.id ? null : current));
    try {
      const res = await fetch(`/api/cards/${card.id}`, { method: "DELETE" });
      if (!res.ok) {
        deletingIds.current.delete(card.id);
        setCards(prev);
        if (wasOpen) setOpenCard(wasOpen);
      }
    } catch {
      deletingIds.current.delete(card.id);
      setCards(prev);
      if (wasOpen) setOpenCard(wasOpen);
    }
  }

  async function handleEditCardSave(updates: EditCardUpdates) {
    if (!editingCard) return;
    const prev = cards;
    const cardId = editingCard.id;
    const { attachments: updateAttachments, ...restUpdates } = updates;
    const optimisticUpdates: Partial<CardData> = { ...restUpdates };
    if (updateAttachments) {
      optimisticUpdates.attachments = updateAttachments.map((attachment, index) => ({
        id:
          attachment.tempId &&
          !attachment.tempId.startsWith("legacy-") &&
          !attachment.tempId.startsWith("tmp-")
            ? attachment.tempId
            : `opt-${index}-${attachment.kind}`,
        kind: attachment.kind,
        url: attachment.url,
        previewUrl: attachment.previewUrl ?? null,
        fileName: attachment.fileName ?? null,
        fileSize: attachment.fileSize ?? null,
        mimeType: attachment.mimeType ?? null,
        order: index,
      }));
    }
    setCards((list) =>
      sortPosts(
        list.map((card) =>
          card.id === cardId ? { ...card, ...optimisticUpdates } : card,
        ),
      ),
    );
    setOpenCard((card) =>
      card?.id === cardId ? { ...card, ...optimisticUpdates } : card,
    );
    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        setCards(prev);
        setOpenCard((card) => (card?.id === cardId ? editingCard : card));
        alert("게시글 수정에 실패했어요.");
        return;
      }
      const refreshed = await fetch(`/api/cards/${cardId}`).catch(() => null);
      if (refreshed?.ok) {
        const data = (await refreshed.json()) as { card?: CardData };
        if (data.card) {
          setCards((list) =>
            sortPosts(list.map((card) => (card.id === cardId ? data.card! : card))),
          );
          setOpenCard((card) => (card?.id === cardId ? data.card! : card));
        }
      }
    } catch {
      setCards(prev);
      setOpenCard((card) => (card?.id === cardId ? editingCard : card));
      alert("게시글 수정에 실패했어요.");
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

  async function handleMoveSection(
    sectionId: string,
    direction: "up" | "down",
  ): Promise<void> {
    const visualSections = [...sections].sort(sortSections);
    const fromIdx = visualSections.findIndex((s) => s.id === sectionId);
    const toIdx = direction === "up" ? fromIdx - 1 : fromIdx + 1;
    if (fromIdx < 0 || toIdx < 0 || toIdx >= visualSections.length) return;

    const prev = sections;
    const next = [...visualSections];
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return;
    next.splice(toIdx, 0, moved);

    const pinned = next.filter((s) => s.pinned);
    const unpinned = next.filter((s) => !s.pinned);
    const orderById = new Map<string, number>();
    pinned.forEach((s, i) => orderById.set(s.id, i));
    unpinned.forEach((s, i) => orderById.set(s.id, unpinned.length - 1 - i));

    const normalised = next.map((s) => ({
      ...s,
      order: orderById.get(s.id) ?? s.order,
    }));
    setSections(normalised);
    setSectionOrderBusyId(sectionId);

    const prevById = new Map(prev.map((s) => [s.id, s] as const));
    const changed = normalised.filter((s) => prevById.get(s.id)?.order !== s.order);
    try {
      const responses = await Promise.all(
        changed.map((s) =>
          fetch(`/api/sections/${s.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ order: s.order }),
          }),
        ),
      );
      if (responses.some((res) => !res.ok)) {
        setSections(prev);
        alert("섹션 순서 변경에 실패했어요.");
      }
    } catch {
      setSections(prev);
      alert("섹션 순서 변경에 실패했어요.");
    } finally {
      setSectionOrderBusyId(null);
    }
  }

  async function handleSectionTemplateChange(
    sectionId: string,
    activityTemplate: StreamActivityTemplate | null,
  ): Promise<boolean> {
    setTemplateBusySectionId(sectionId);
    const prev = sections;
    const currentSection = sections.find((s) => s.id === sectionId);
    const currentState = normalizeStreamActivityTemplateState(
      currentSection?.activityTemplateState,
    );
    const baseState: StreamActivityTemplateState = {
      ...(currentState.slideshowEnabled === undefined
        ? {}
        : { slideshowEnabled: currentState.slideshowEnabled }),
      ...(currentState.streamTitlePrompt
        ? { streamTitlePrompt: currentState.streamTitlePrompt }
        : {}),
      ...(currentState.streamContentPrompt
        ? { streamContentPrompt: currentState.streamContentPrompt }
        : {}),
    };
    const activityTemplateState =
      activityTemplate === "word_cloud"
        ? { ...baseState, wordCloudPublished: false }
        : Object.keys(baseState).length > 0
          ? baseState
          : null;
    setSections((list) =>
      list.map((s) =>
        s.id === sectionId
          ? { ...s, activityTemplate, activityTemplateState }
          : s,
      ),
    );
    try {
      const res = await fetch(`/api/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityTemplate, activityTemplateState }),
      });
      if (!res.ok) {
        setSections(prev);
        alert("활동 템플릿 저장에 실패했어요.");
        return false;
      }
      const { section } = (await res.json()) as { section: StreamSection };
      setSections((list) =>
        list.map((s) =>
          s.id === section.id
            ? {
                ...s,
                activityTemplate: section.activityTemplate ?? null,
                activityTemplateState: normalizeStreamActivityTemplateState(
                  section.activityTemplateState,
                ),
              }
            : s,
        ),
      );
      return true;
    } catch {
      setSections(prev);
      alert("활동 템플릿 저장에 실패했어요.");
      return false;
    } finally {
      setTemplateBusySectionId(null);
    }
  }

  async function handleSectionSlideshowToggle(section: StreamSection): Promise<void> {
    if (sectionSlideshowBusyId) return;
    const prev = sections;
    const currentState = normalizeStreamActivityTemplateState(section.activityTemplateState);
    const nextState: StreamActivityTemplateState = {
      ...currentState,
      slideshowEnabled: !isSectionSlideshowEnabled(section),
    };
    setSectionSlideshowBusyId(section.id);
    setSections((list) =>
      list.map((candidate) =>
        candidate.id === section.id
          ? { ...candidate, activityTemplateState: nextState }
          : candidate,
      ),
    );
    try {
      const res = await fetch(`/api/sections/${section.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityTemplateState: nextState }),
      });
      if (!res.ok) {
        setSections(prev);
        alert("슬라이드쇼 설정 저장에 실패했어요.");
        return;
      }
      const { section: saved } = (await res.json()) as { section: StreamSection };
      setSections((list) =>
        list.map((candidate) =>
          candidate.id === saved.id
            ? {
                ...candidate,
                activityTemplateState: normalizeStreamActivityTemplateState(
                  saved.activityTemplateState,
                ),
              }
            : candidate,
        ),
      );
    } catch {
      setSections(prev);
      alert("슬라이드쇼 설정 저장에 실패했어요.");
    } finally {
      setSectionSlideshowBusyId(null);
    }
  }

  async function handleSectionWritingGuidanceSave(
    section: StreamSection,
    prompts: { titlePrompt: string; contentPrompt: string },
  ): Promise<boolean> {
    if (sectionPromptBusyId) return false;
    const prev = sections;
    const currentState = normalizeStreamActivityTemplateState(section.activityTemplateState);
    const nextState: StreamActivityTemplateState = {
      ...currentState,
      streamTitlePrompt: prompts.titlePrompt.trim() || undefined,
      streamContentPrompt: prompts.contentPrompt.trim() || undefined,
    };
    setSectionPromptBusyId(section.id);
    setSections((list) =>
      list.map((candidate) =>
        candidate.id === section.id
          ? { ...candidate, activityTemplateState: nextState }
          : candidate,
      ),
    );
    try {
      const res = await fetch(`/api/sections/${section.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityTemplateState: nextState }),
      });
      if (!res.ok) {
        setSections(prev);
        alert("글쓰기 안내 저장에 실패했어요.");
        return false;
      }
      const { section: saved } = (await res.json()) as { section: StreamSection };
      setSections((list) =>
        list.map((candidate) =>
          candidate.id === saved.id
            ? {
                ...candidate,
                activityTemplateState: normalizeStreamActivityTemplateState(
                  saved.activityTemplateState,
                ),
              }
            : candidate,
        ),
      );
      return true;
    } catch {
      setSections(prev);
      alert("글쓰기 안내 저장에 실패했어요.");
      return false;
    } finally {
      setSectionPromptBusyId(null);
    }
  }

  async function handleSectionActivityStateChange(
    sectionId: string,
    activityTemplateState: StreamActivityTemplateState | null,
  ): Promise<boolean> {
    const prev = sections;
    const currentSection = sections.find((section) => section.id === sectionId);
    const nextActivityTemplateState =
      activityTemplateState === null
        ? null
        : {
            ...normalizeStreamActivityTemplateState(
              currentSection?.activityTemplateState,
            ),
            ...activityTemplateState,
          };
    setSections((list) =>
      list.map((s) =>
        s.id === sectionId
          ? { ...s, activityTemplateState: nextActivityTemplateState }
          : s,
      ),
    );
    try {
      const res = await fetch(`/api/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityTemplateState: nextActivityTemplateState }),
      });
      if (!res.ok) {
        setSections(prev);
        alert("활동 상태 저장에 실패했어요.");
        return false;
      }
      const { section } = (await res.json()) as { section: StreamSection };
      setSections((list) =>
        list.map((s) =>
          s.id === section.id
            ? {
                ...s,
                activityTemplateState: normalizeStreamActivityTemplateState(
                  section.activityTemplateState,
                ),
              }
            : s,
        ),
      );
      return true;
    } catch {
      setSections(prev);
      alert("활동 상태 저장에 실패했어요.");
      return false;
    }
  }

  async function handleToggleGuide(card: CardData, guidePinned: boolean) {
    const prev = cards;
    setGuideBusyId(card.id);
    setCards((list) =>
      sortPosts(
        list.map((item) =>
          item.id === card.id ? { ...item, guidePinned } : item,
        ),
      ),
    );
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guidePinned }),
      });
      if (!res.ok) {
        setCards(prev);
        alert("가이드 고정 설정에 실패했어요.");
      }
    } catch {
      setCards(prev);
      alert("가이드 고정 설정에 실패했어요.");
    } finally {
      setGuideBusyId(null);
    }
  }

  async function handleMoveSectionContent(
    section: StreamSection,
    items: StreamContentItem[],
    itemId: string,
    direction: "up" | "down",
  ): Promise<void> {
    const fromIdx = items.findIndex((item) => item.id === itemId);
    const toIdx = direction === "up" ? fromIdx - 1 : fromIdx + 1;
    if (fromIdx < 0 || toIdx < 0 || toIdx >= items.length) return;

    const prevCards = cards;
    const prevSections = sections;
    const nextItems = [...items];
    const [moved] = nextItems.splice(fromIdx, 1);
    if (!moved) return;
    nextItems.splice(toIdx, 0, moved);

    const cardOrder = new Map<string, number>();
    let templateOrder: number | null = null;
    nextItems.forEach((item, index) => {
      if (item.kind === "card") cardOrder.set(item.card.id, index);
      else templateOrder = index;
    });

    const nextTemplateState =
      templateOrder === null
        ? null
        : {
            ...normalizeStreamActivityTemplateState(section.activityTemplateState),
            activityTemplateOrder: templateOrder,
          };

    setContentOrderBusyId(itemId);
    setCards((list) =>
      sortPosts(
        list.map((card) => {
          const order = cardOrder.get(card.id);
          return order === undefined ? card : { ...card, order };
        }),
      ),
    );
    if (nextTemplateState) {
      setSections((list) =>
        list.map((candidate) =>
          candidate.id === section.id
            ? { ...candidate, activityTemplateState: nextTemplateState }
            : candidate,
        ),
      );
    }

    try {
      const responses = await Promise.all([
        ...Array.from(cardOrder.entries()).map(([id, order]) =>
          fetch(`/api/cards/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ order }),
          }),
        ),
        ...(nextTemplateState
          ? [
              fetch(`/api/sections/${section.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ activityTemplateState: nextTemplateState }),
              }),
            ]
          : []),
      ]);
      if (responses.some((res) => !res.ok)) {
        setCards(prevCards);
        setSections(prevSections);
        alert("콘텐츠 순서 변경에 실패했어요.");
      }
    } catch {
      setCards(prevCards);
      setSections(prevSections);
      alert("콘텐츠 순서 변경에 실패했어요.");
    } finally {
      setContentOrderBusyId(null);
    }
  }

  async function handleSaveBreakout(
    sectionId: string,
    groups: GroupEditorDraft[],
  ): Promise<boolean> {
    setBreakoutBusyId(sectionId);
    try {
      const res = await fetch(`/api/sections/${sectionId}/breakout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupCount: Math.max(1, groups.length),
          groupCapacity: null,
          joinMode: "teacher_assign",
          groups,
        }),
      });
      if (!res.ok) {
        alert("모둠 활동 설정에 실패했어요.");
        return false;
      }
      const data = normalizeBreakoutStateForViewer(
        (await res.json()) as BreakoutState,
        !!isStudentViewer,
      );
      const groupIdByStudentId = new Map<string, string>();
      for (const group of data.groups) {
        for (const member of group.members ?? []) {
          groupIdByStudentId.set(member.studentId, group.id);
        }
      }
      setBreakoutBySection((prev) => ({ ...prev, [sectionId]: data }));
      setActiveGroupBySection((prev) => ({ ...prev, [sectionId]: "all" }));
      setCards((prev) =>
        prev.map((card) => {
          if (
            card.sectionId !== sectionId ||
            card.guidePinned ||
            !cardHasAnyStudentAuthor(card)
          ) {
            return card;
          }
          return {
            ...card,
            groupId: getGroupIdForCardAuthors(card, groupIdByStudentId),
          };
        }),
      );
      return true;
    } catch {
      alert("모둠 활동 설정에 실패했어요.");
      return false;
    } finally {
      setBreakoutBusyId(null);
    }
  }

  async function handleDisableBreakout(sectionId: string): Promise<boolean> {
    setBreakoutBusyId(sectionId);
    try {
      const res = await fetch(`/api/sections/${sectionId}/breakout`, {
        method: "DELETE",
      });
      if (!res.ok) {
        alert("모둠 활동 해제에 실패했어요.");
        return false;
      }
      const data = normalizeBreakoutStateForViewer(
        (await res.json()) as BreakoutState,
        !!isStudentViewer,
      );
      setBreakoutBySection((prev) => ({ ...prev, [sectionId]: data }));
      setActiveGroupBySection((prev) => {
        const next = { ...prev };
        delete next[sectionId];
        return next;
      });
      setCards((prev) =>
        prev.map((card) =>
          card.sectionId === sectionId && card.groupId
            ? { ...card, groupId: null }
            : card,
        ),
      );
      return true;
    } catch {
      alert("모둠 활동 해제에 실패했어요.");
      return false;
    } finally {
      setBreakoutBusyId(null);
    }
  }

  async function handleJoinBreakout(sectionId: string, groupId: string): Promise<boolean> {
    const previousGroupId = breakoutBySection[sectionId]?.membership?.groupId ?? null;
    setBreakoutBusyId(sectionId);
    try {
      const res = await fetch(`/api/sections/${sectionId}/breakout/membership`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      if (!res.ok) {
        alert("모둠 선택에 실패했어요.");
        return false;
      }
      const data = normalizeBreakoutStateForViewer(
        (await res.json()) as BreakoutState,
        !!isStudentViewer,
      );
      setBreakoutBySection((prev) => ({ ...prev, [sectionId]: data }));
      setActiveGroupBySection((prev) => ({ ...prev, [sectionId]: groupId }));
      setCards((prev) =>
        prev.map((card) =>
          card.sectionId === sectionId &&
          cardHasStudentAuthor(card, currentUserId) &&
          (card.groupId == null || card.groupId === previousGroupId)
            ? { ...card, groupId }
            : card,
        ),
      );
      return true;
    } catch {
      alert("모둠 선택에 실패했어요.");
      return false;
    } finally {
      setBreakoutBusyId(null);
    }
  }

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
            boardId={boardId}
            canEdit={canManageSections}
            currentUserId={currentUserId}
            currentRole={currentRole}
            canAddPost={canAddPost}
            isStudentViewer={isStudentViewer}
            currentStudentName={currentStudentName}
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
            onToggleSectionSlideshow={handleSectionSlideshowToggle}
            onOpenSectionPromptModal={setSectionPromptModalId}
            onMoveSection={handleMoveSection}
            onOpenTemplateModal={setTemplateModalSectionId}
            onOpenBreakoutModal={setBreakoutModalSectionId}
            onOpenComposerForSection={openComposer}
            onSectionActivityStateChange={handleSectionActivityStateChange}
            onCreateSectionCard={(sectionId, data, groupId) =>
              handleAdd({ ...data, sectionId }, groupId)
            }
            onMoveSectionContent={handleMoveSectionContent}
            templateBusySectionId={templateBusySectionId}
            sectionSlideshowBusyId={sectionSlideshowBusyId}
            sectionPromptBusyId={sectionPromptBusyId}
            sectionOrderBusyId={sectionOrderBusyId}
            contentOrderBusyId={contentOrderBusyId}
            guideBusyId={guideBusyId}
            breakoutBySection={breakoutBySection}
            activeGroupBySection={activeGroupBySection}
            breakoutBusyId={breakoutBusyId}
            onSetActiveGroup={(sectionId, group) =>
              setActiveGroupBySection((prev) => ({ ...prev, [sectionId]: group }))
            }
            onJoinBreakout={handleJoinBreakout}
            onRemoveBreakoutMember={handleRemoveBreakoutMember}
            onEditCard={setEditingCard}
            onOpenCard={setOpenCard}
            onDeleteCard={handleDelete}
            onToggleGuide={handleToggleGuide}
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
          <BoardTimerFab />
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

type StreamGroupedFeedProps = {
  sections: StreamSection[];
  grouped: { bySection: Map<string, CardData[]>; unsectioned: CardData[] };
  boardId: string;
  canEdit: boolean;
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  canAddPost: boolean;
  isStudentViewer?: boolean;
  currentStudentName?: string | null;
  isAddingSection: boolean;
  newSectionTitle: string;
  sectionAddBusy: boolean;
  sectionAddError: string | null;
  onStartAddSection: () => void;
  onCancelAddSection: () => void;
  onSectionTitleChange: (title: string) => void;
  onSubmitSection: (event: FormEvent<HTMLFormElement>) => void;
  onOpenSectionPanel: (sectionId: string, tab: "rename" | "delete") => void;
  onToggleSectionSlideshow: (section: StreamSection) => Promise<void>;
  onOpenSectionPromptModal: (sectionId: string) => void;
  onMoveSection: (sectionId: string, direction: "up" | "down") => Promise<void>;
  onOpenTemplateModal: (sectionId: string) => void;
  onOpenBreakoutModal: (sectionId: string) => void;
  onOpenComposerForSection: (sectionId: string, groupId?: string | null) => void;
  onSectionActivityStateChange: (
    sectionId: string,
    activityTemplateState: StreamActivityTemplateState | null,
  ) => Promise<boolean>;
  onCreateSectionCard: (
    sectionId: string,
    data: { title: string; content: string },
    groupId?: string | null,
  ) => Promise<void>;
  onMoveSectionContent: (
    section: StreamSection,
    items: StreamContentItem[],
    itemId: string,
    direction: "up" | "down",
  ) => Promise<void>;
  templateBusySectionId: string | null;
  sectionSlideshowBusyId: string | null;
  sectionPromptBusyId: string | null;
  sectionOrderBusyId: string | null;
  contentOrderBusyId: string | null;
  guideBusyId: string | null;
  breakoutBySection: Record<string, BreakoutState>;
  activeGroupBySection: Record<string, string>;
  breakoutBusyId: string | null;
  onSetActiveGroup: (sectionId: string, group: string) => void;
  onJoinBreakout: (sectionId: string, groupId: string) => Promise<boolean>;
  onRemoveBreakoutMember: (
    sectionId: string,
    membershipId: string,
  ) => Promise<boolean>;
  onEditCard: (card: CardData) => void;
  onOpenCard: (card: CardData) => void;
  onDeleteCard: (card: CardData) => void;
  onToggleGuide: (card: CardData, guidePinned: boolean) => void;
};

function StreamGroupedFeed({
  sections,
  grouped,
  boardId,
  canEdit,
  currentUserId,
  currentRole,
  canAddPost,
  isStudentViewer,
  currentStudentName,
  isAddingSection,
  newSectionTitle,
  sectionAddBusy,
  sectionAddError,
  onStartAddSection,
  onCancelAddSection,
  onSectionTitleChange,
  onSubmitSection,
  onOpenSectionPanel,
  onToggleSectionSlideshow,
  onOpenSectionPromptModal,
  onMoveSection,
  onOpenTemplateModal,
  onOpenBreakoutModal,
  onOpenComposerForSection,
  onSectionActivityStateChange,
  onCreateSectionCard,
  onMoveSectionContent,
  templateBusySectionId,
  sectionSlideshowBusyId,
  sectionPromptBusyId,
  sectionOrderBusyId,
  contentOrderBusyId,
  guideBusyId,
  breakoutBySection,
  activeGroupBySection,
  breakoutBusyId,
  onSetActiveGroup,
  onJoinBreakout,
  onRemoveBreakoutMember,
  onEditCard,
  onOpenCard,
  onDeleteCard,
  onToggleGuide,
}: StreamGroupedFeedProps) {
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

      {sections.map((section, sectionIndex) => {
        const bucket = grouped.bySection.get(section.id) ?? [];
        const breakout =
          breakoutBySection[section.id] ??
          buildBreakoutStateFromSection(section, canEdit);
        const hasBreakout = !!breakout?.config;
        const guideCards = bucket.filter(isGuideCard);
        const sectionCards = bucket.filter((card) => !isGuideCard(card));
	        const contentItems = buildSectionContentItems(section, sectionCards);
	        const orderBusy = sectionOrderBusyId !== null;
	        const slideshowEnabled = isSectionSlideshowEnabled(section);
	        const canMoveUp = sectionIndex > 0;
	        const canMoveDown = sectionIndex < sections.length - 1;
        return (
          <section
            key={section.id}
            className={`stream-section-group${
              section.activityTemplate ? " stream-section-group--activity" : ""
            }`}
          >
            <header className="stream-section-header">
              <div className="stream-section-heading">
                <h2 className="stream-section-title">{section.title}</h2>
                {canEdit && (
	                  <div className="stream-section-inline-actions">
	                    <button
	                      type="button"
	                      className={`ui-icon-action ui-icon-action-soft stream-section-icon-btn stream-section-slideshow-btn${
	                        slideshowEnabled ? " is-active" : ""
	                      }`}
	                      aria-label={
	                        slideshowEnabled
	                          ? `${section.title} 슬라이드쇼에서 제외`
	                          : `${section.title} 슬라이드쇼에 포함`
	                      }
	                      aria-pressed={slideshowEnabled}
	                      title={slideshowEnabled ? "슬라이드쇼 포함" : "슬라이드쇼 제외"}
	                      onClick={() => void onToggleSectionSlideshow(section)}
	                      disabled={sectionSlideshowBusyId === section.id}
	                    >
	                      <SlideshowIcon size={16} />
	                    </button>
	                    <button
	                      type="button"
	                      className="ui-icon-action ui-icon-action-soft stream-section-icon-btn"
	                      aria-label={`${section.title} 글쓰기 안내 설정`}
	                      title="글쓰기 안내"
	                      onClick={() => onOpenSectionPromptModal(section.id)}
	                      disabled={sectionPromptBusyId === section.id}
	                    >
	                      <WritingGuideIcon size={16} />
	                    </button>
	                    <button
	                      type="button"
	                      className="ui-icon-action ui-icon-action-soft stream-section-icon-btn"
                      aria-label={`${section.title} 이름 변경`}
                      title="이름 변경"
                      onClick={() => onOpenSectionPanel(section.id, "rename")}
                    >
                      <PencilIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className="ui-icon-action ui-icon-action-soft stream-section-icon-btn"
                      aria-label={`${section.title} 위로 이동`}
                      title="위로 이동"
                      onClick={() => void onMoveSection(section.id, "up")}
                      disabled={orderBusy || !canMoveUp}
                    >
                      <ChevronUpIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className="ui-icon-action ui-icon-action-soft stream-section-icon-btn"
                      aria-label={`${section.title} 아래로 이동`}
                      title="아래로 이동"
                      onClick={() => void onMoveSection(section.id, "down")}
                      disabled={orderBusy || !canMoveDown}
                    >
                      <ChevronDownIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className="ui-icon-action ui-icon-action-soft ui-icon-action-danger stream-section-icon-btn"
                      aria-label={`${section.title} 삭제`}
                      title="삭제"
                      onClick={() => onOpenSectionPanel(section.id, "delete")}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                )}
                {section.activityTemplate && (
                  <span className="stream-section-template-badge">
                    {STREAM_ACTIVITY_TEMPLATE_LABELS[section.activityTemplate]}
                  </span>
                )}
              </div>
             {canEdit && (
               <div className="stream-section-menu">
                 <button
                   type="button"
                   className={`stream-section-template-open stream-section-breakout-open${
                     breakout?.config ? " is-active" : ""
                   }`}
                   onClick={() => onOpenBreakoutModal(section.id)}
                   disabled={breakoutBusyId === section.id}
                   aria-label={`${section.title} 모둠 활동 설정`}
                 >
                   <GroupIcon size={16} />
                   {breakout?.config
                     ? `모둠 ${breakout.config.groupCount}`
                     : "모둠활동"}
                 </button>
                 <button
                   type="button"
                   className="stream-section-template-open"
                   onClick={() => onOpenTemplateModal(section.id)}
                   disabled={templateBusySectionId === section.id}
                   aria-label={`${section.title} 활동 템플릿 설정`}
                 >
                   <TemplateIcon size={16} />
                   템플릿
                 </button>
               </div>
             )}
            </header>
            {canAddPost && (
              <div className="stream-section-post-row">
                <button
                  type="button"
                  className="stream-section-post-btn"
                  onClick={() =>
                    onOpenComposerForSection(
                      section.id,
                      breakout?.config && !breakout.canManage
                        ? breakout.membership?.groupId ?? null
                        : null,
                    )
                  }
                >
                  + 게시글 추가
                </button>
              </div>
            )}
            {!hasBreakout && (
              <StreamGuideList
                cards={guideCards}
                boardId={boardId}
                currentUserId={currentUserId}
                currentRole={currentRole}
                canToggleGuide={canEdit}
                isStudentViewer={!!isStudentViewer}
                guideBusyId={guideBusyId}
                onEditCard={onEditCard}
                onOpenCard={onOpenCard}
                onDeleteCard={onDeleteCard}
                onToggleGuide={onToggleGuide}
              />
            )}
            {hasBreakout && breakout ? (
              <StreamBreakoutBody
                section={section}
                bucket={sectionCards}
                guideCards={guideCards}
                state={breakout}
                activeGroup={activeGroupBySection[section.id] ?? "all"}
                busy={breakoutBusyId === section.id}
                boardId={boardId}
                canAddPost={canAddPost}
                currentUserId={currentUserId}
                currentRole={currentRole}
                currentStudentName={currentStudentName}
                isStudentViewer={!!isStudentViewer}
                onSetActiveGroup={(group) => onSetActiveGroup(section.id, group)}
                onJoin={(groupId) => onJoinBreakout(section.id, groupId)}
                onRemoveMember={(membershipId) =>
                  onRemoveBreakoutMember(section.id, membershipId)
                }
                onCreateCard={(data, groupId) =>
                  onCreateSectionCard(section.id, data, groupId)
                }
                onSectionActivityStateChange={onSectionActivityStateChange}
                onEditCard={onEditCard}
                onOpenCard={onOpenCard}
                onDeleteCard={onDeleteCard}
                onToggleGuide={onToggleGuide}
                guideBusyId={guideBusyId}
              />
            ) : contentItems.length === 0 && guideCards.length === 0 ? (
              <div className="stream-section-empty">아직 게시글이 없어요.</div>
            ) : section.activityTemplate ? (
              contentItems.map((item, itemIndex) => (
                <StreamSectionContentItem
                  key={item.id}
                  item={item}
                  itemIndex={itemIndex}
                  itemCount={contentItems.length}
                  section={section}
                  cards={sectionCards}
                  canReorder={canAddPost}
                  canEditTemplate={canAddPost}
                  isTeacherView={canEdit}
                  orderBusyId={contentOrderBusyId}
                  guideBusyId={guideBusyId}
                  boardId={boardId}
                  currentUserId={currentUserId}
                  currentRole={currentRole}
                  currentStudentName={currentStudentName}
                  isStudentViewer={!!isStudentViewer}
                  onMove={(id, direction) =>
                    onMoveSectionContent(section, contentItems, id, direction)
                  }
                  onEditCard={onEditCard}
                  onOpenCard={onOpenCard}
                  onDeleteCard={onDeleteCard}
                  onToggleGuide={onToggleGuide}
                  onSectionActivityStateChange={onSectionActivityStateChange}
                  onCreateSectionCard={onCreateSectionCard}
                />
              ))
            ) : (
              <div className="stream-post-grid">
                {contentItems.map((item, itemIndex) => (
                  <StreamSectionContentItem
                    key={item.id}
                    item={item}
                    itemIndex={itemIndex}
                    itemCount={contentItems.length}
                    section={section}
                    cards={sectionCards}
                    canReorder={canAddPost}
                    canEditTemplate={canAddPost}
                    isTeacherView={canEdit}
                    orderBusyId={contentOrderBusyId}
                    guideBusyId={guideBusyId}
                    boardId={boardId}
                    currentUserId={currentUserId}
                    currentRole={currentRole}
                    currentStudentName={currentStudentName}
                    isStudentViewer={!!isStudentViewer}
                    onMove={(id, direction) =>
                      onMoveSectionContent(section, contentItems, id, direction)
                    }
                    onEditCard={onEditCard}
                    onOpenCard={onOpenCard}
                    onDeleteCard={onDeleteCard}
                    onToggleGuide={onToggleGuide}
                    onSectionActivityStateChange={onSectionActivityStateChange}
                    onCreateSectionCard={onCreateSectionCard}
                  />
                ))}
              </div>
           )}
          </section>
        );
      })}

      {grouped.unsectioned.length > 0 && (
        <section className="stream-section-group stream-section-group-unsectioned">
          <header className="stream-section-header">
            <h2 className="stream-section-title">섹션 없음</h2>
          </header>
          <div className="stream-post-grid">
            {grouped.unsectioned.map((card) => (
              <StreamPost
                key={card.id}
                card={card}
                canEdit={canDeleteCard(card, currentUserId, currentRole)}
                onEdit={() => onEditCard(card)}
                onOpen={() => onOpenCard(card)}
                canDelete={canDeleteCard(card, currentUserId, currentRole)}
                onDelete={() => onDeleteCard(card)}
                boardId={boardId}
                isStudentViewer={!!isStudentViewer}
              />
            ))}
          </div>
        </section>
      )}

    </>
  );
}

function StreamGuideList({
  cards,
  boardId,
  currentUserId,
  currentRole,
  canToggleGuide,
  isStudentViewer,
  guideBusyId,
  onEditCard,
  onOpenCard,
  onDeleteCard,
  onToggleGuide,
}: {
  cards: CardData[];
  boardId: string;
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  canToggleGuide: boolean;
  isStudentViewer: boolean;
  guideBusyId: string | null;
  onEditCard: (card: CardData) => void;
  onOpenCard: (card: CardData) => void;
  onDeleteCard: (card: CardData) => void;
  onToggleGuide: (card: CardData, guidePinned: boolean) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="stream-section-guide-list" aria-label="섹션 가이드">
      <div className="stream-section-guide-label">가이드</div>
      <div className="stream-post-grid stream-section-guide-grid">
        {cards.map((card) => (
          <StreamPost
            key={card.id}
            card={card}
            canEdit={canDeleteCard(card, currentUserId, currentRole)}
            onEdit={() => onEditCard(card)}
            onOpen={() => onOpenCard(card)}
            canDelete={canDeleteCard(card, currentUserId, currentRole)}
            onDelete={() => onDeleteCard(card)}
            canToggleGuide={canToggleGuideCard(card, canToggleGuide)}
            guideBusy={guideBusyId === card.id}
            onToggleGuide={(guidePinned) => onToggleGuide(card, guidePinned)}
            boardId={boardId}
            isStudentViewer={isStudentViewer}
          />
        ))}
      </div>
    </div>
  );
}

function StreamSectionContentItem({
  item,
  itemIndex,
  itemCount,
  section,
  cards,
  canReorder,
  canEditTemplate,
  isTeacherView,
  orderBusyId,
  guideBusyId,
  boardId,
  currentUserId,
  currentRole,
  currentStudentName,
  isStudentViewer,
  onMove,
  onEditCard,
  onOpenCard,
  onDeleteCard,
  onToggleGuide,
  onSectionActivityStateChange,
  onCreateSectionCard,
}: {
  item: StreamContentItem;
  itemIndex: number;
  itemCount: number;
  section: StreamSection;
  cards: CardData[];
  canReorder: boolean;
  canEditTemplate: boolean;
  isTeacherView: boolean;
  orderBusyId: string | null;
  guideBusyId: string | null;
  boardId: string;
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  currentStudentName?: string | null;
  isStudentViewer: boolean;
  onMove: (itemId: string, direction: "up" | "down") => Promise<void>;
  onEditCard: (card: CardData) => void;
  onOpenCard: (card: CardData) => void;
  onDeleteCard: (card: CardData) => void;
  onToggleGuide: (card: CardData, guidePinned: boolean) => void;
  onSectionActivityStateChange: (
    sectionId: string,
    activityTemplateState: StreamActivityTemplateState | null,
  ) => Promise<boolean>;
  onCreateSectionCard: (
    sectionId: string,
    data: { title: string; content: string },
    groupId?: string | null,
  ) => Promise<void>;
}) {
  const moving = orderBusyId === item.id;
  const label = item.kind === "template" ? "템플릿" : "게시글";
  return (
    <div className="stream-section-content-item">
      {canReorder && itemCount > 1 && (
        <div className="stream-section-content-order">
          <button
            type="button"
            className="ui-icon-action ui-icon-action-soft stream-section-icon-btn"
            aria-label={`${label} 위로 이동`}
            title="위로 이동"
            onClick={() => void onMove(item.id, "up")}
            disabled={moving || itemIndex === 0}
          >
            <ChevronUpIcon size={16} />
          </button>
          <button
            type="button"
            className="ui-icon-action ui-icon-action-soft stream-section-icon-btn"
            aria-label={`${label} 아래로 이동`}
            title="아래로 이동"
            onClick={() => void onMove(item.id, "down")}
            disabled={moving || itemIndex === itemCount - 1}
          >
            <ChevronDownIcon size={16} />
          </button>
        </div>
      )}
      {item.kind === "template" ? (
        <StreamActivityTemplatePanel
          template={section.activityTemplate!}
          sectionId={section.id}
          cards={cards}
          canEdit={canEditTemplate}
          isTeacherView={isTeacherView}
          windowCurrentMemberName={currentStudentName}
          state={section.activityTemplateState ?? null}
          canEditCard={(card) => canDeleteCard(card, currentUserId, currentRole)}
          onEditCard={onEditCard}
          onDeleteCard={onDeleteCard}
          onStateChange={(nextState) =>
            onSectionActivityStateChange(section.id, nextState)
          }
          onCreateCard={(data) => onCreateSectionCard(section.id, data)}
        />
      ) : (
        <StreamPost
          card={item.card}
          canEdit={canDeleteCard(item.card, currentUserId, currentRole)}
          onEdit={() => onEditCard(item.card)}
          onOpen={() => onOpenCard(item.card)}
          canDelete={canDeleteCard(item.card, currentUserId, currentRole)}
          onDelete={() => onDeleteCard(item.card)}
          canToggleGuide={canToggleGuideCard(item.card, isTeacherView)}
          guideBusy={guideBusyId === item.card.id}
          onToggleGuide={(guidePinned) => onToggleGuide(item.card, guidePinned)}
          boardId={boardId}
          isStudentViewer={isStudentViewer}
        />
      )}
    </div>
  );
}

function ActivityTemplateModal({
  section,
  busy,
  onClose,
  onApply,
}: {
  section: StreamSection;
  busy: boolean;
  onClose: () => void;
  onApply: (template: StreamActivityTemplate | null) => Promise<void>;
}) {
  return (
    <>
      <div className="modal-backdrop" onClick={busy ? undefined : onClose} />
      <div
        className="add-card-modal stream-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stream-template-modal-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="stream-template-modal-title">
            활동 템플릿
          </h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="stream-template-modal-section">{section.title}</p>
          <div className="stream-template-grid">
            {STREAM_ACTIVITY_TEMPLATES.map((template) => {
              const selected = section.activityTemplate === template;
              return (
                <button
                  key={template}
                  type="button"
                  className={`stream-template-card${selected ? " is-selected" : ""}`}
                  onClick={() => onApply(template)}
                  disabled={busy}
                  aria-pressed={selected}
                >
                  <StreamTemplatePreviewSvg template={template} />
                  <span className="stream-template-card-title">
                    {STREAM_ACTIVITY_TEMPLATE_LABELS[template]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="stream-template-modal-actions">
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={() => onApply(null)}
              disabled={busy || !section.activityTemplate}
            >
              템플릿 해제
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function SectionWritingPromptModal({
  section,
  initialTitlePrompt,
  initialContentPrompt,
  busy,
  onClose,
  onSave,
}: {
  section: StreamSection;
  initialTitlePrompt: string;
  initialContentPrompt: string;
  busy: boolean;
  onClose: () => void;
  onSave: (prompts: { titlePrompt: string; contentPrompt: string }) => Promise<void>;
}) {
  const [titlePrompt, setTitlePrompt] = useState(initialTitlePrompt);
  const [contentPrompt, setContentPrompt] = useState(initialContentPrompt);

  useEffect(() => {
    setTitlePrompt(initialTitlePrompt);
    setContentPrompt(initialContentPrompt);
  }, [initialTitlePrompt, initialContentPrompt, section.id]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSave({ titlePrompt, contentPrompt });
  }

  return (
    <>
      <div className="modal-backdrop" onClick={busy ? undefined : onClose} />
      <div
        className="add-card-modal stream-template-modal stream-section-prompt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stream-section-prompt-modal-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="stream-section-prompt-modal-title">
            글쓰기 안내
          </h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <form className="modal-body stream-section-prompt-form" onSubmit={handleSubmit}>
          <p className="stream-template-modal-section">{section.title}</p>
          <label className="stream-section-prompt-field">
            <span>제목 안내</span>
            <input
              type="text"
              value={titlePrompt}
              onChange={(event) => setTitlePrompt(event.target.value)}
              placeholder="제목 입력칸에 보여줄 문구"
              maxLength={120}
              disabled={busy}
            />
          </label>
          <label className="stream-section-prompt-field">
            <span>본문 안내</span>
            <textarea
              value={contentPrompt}
              onChange={(event) => setContentPrompt(event.target.value)}
              placeholder="본문 입력칸에 보여줄 문구"
              maxLength={300}
              rows={4}
              disabled={busy}
            />
          </label>
          <div className="stream-template-modal-actions">
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={onClose}
              disabled={busy}
            >
              취소
            </button>
            <button type="submit" className="modal-btn-submit" disabled={busy}>
              저장
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function StreamTemplatePreviewSvg({
  template,
}: {
  template: StreamActivityTemplate;
}) {
  if (template === "window_opening") {
    return (
      <svg
        className="stream-template-card-preview"
        viewBox="0 0 160 96"
        role="img"
        aria-label="창문 열기 예시"
      >
        <rect className="stream-template-preview-bg" x="1" y="1" width="158" height="94" rx="8" />
        <g className="stream-template-preview-line">
          <rect x="18" y="16" width="124" height="64" rx="4" />
          <path d="M18 37.33h124M18 58.67h124M59.33 16v64M100.67 16v64" />
        </g>
        <rect className="stream-template-preview-accent-fill" x="59.33" y="37.33" width="41.34" height="21.34" />
      </svg>
    );
  }

  if (template === "word_cloud") {
    return (
      <svg
        className="stream-template-card-preview"
        viewBox="0 0 160 96"
        role="img"
        aria-label="워드클라우드 예시"
      >
        <rect className="stream-template-preview-bg" x="1" y="1" width="158" height="94" rx="8" />
        <g className="stream-template-preview-word">
          <text x="48" y="44">생각</text>
          <text x="83" y="61">질문</text>
          <text x="25" y="64">근거</text>
          <text x="93" y="33">탐구</text>
          <text x="61" y="76">정리</text>
        </g>
        <circle className="stream-template-preview-dot" cx="40" cy="28" r="4" />
        <circle className="stream-template-preview-dot" cx="120" cy="70" r="3" />
      </svg>
    );
  }

  if (template === "map") {
    return (
      <svg
        className="stream-template-card-preview"
        viewBox="0 0 160 96"
        role="img"
        aria-label="지도 예시"
      >
        <rect className="stream-template-preview-bg" x="1" y="1" width="158" height="94" rx="8" />
        <path className="stream-template-preview-map-land" d="M18 70 45 18l34 18 29-15 34 50Z" />
        <path className="stream-template-preview-line" d="M43 62c24-28 42-29 74-8" />
        <g className="stream-template-preview-pin">
          <path d="M42 48c0 10-10 20-10 20s-10-10-10-20a10 10 0 1 1 20 0Z" />
          <circle cx="32" cy="48" r="3" />
          <path d="M128 42c0 10-10 20-10 20s-10-10-10-20a10 10 0 1 1 20 0Z" />
          <circle cx="118" cy="42" r="3" />
        </g>
      </svg>
    );
  }

  return (
    <svg
      className="stream-template-card-preview"
      viewBox="0 0 160 96"
      role="img"
      aria-label="연표 예시"
    >
      <rect className="stream-template-preview-bg" x="1" y="1" width="158" height="94" rx="8" />
      <path className="stream-template-preview-line" d="M32 50h96" />
      <g className="stream-template-preview-timeline">
        <circle cx="40" cy="50" r="6" />
        <circle cx="80" cy="50" r="6" />
        <circle cx="120" cy="50" r="6" />
        <path d="M32 26h32M71 70h34M112 26h30" />
      </g>
    </svg>
  );
}

function buildSectionContentItems(
  section: StreamSection,
  cards: CardData[],
): StreamContentItem[] {
  const items: StreamContentItem[] = [];
  const hasTemplate = Boolean(section.activityTemplate);
  const templateOrder =
    normalizeStreamActivityTemplateState(section.activityTemplateState)
      .activityTemplateOrder ?? 0;
  if (hasTemplate) {
    items.push({ kind: "template", id: `template:${section.id}`, order: templateOrder });
  }
  const cardItems = [...cards]
    .sort(compareStreamCards)
    .map((card) => ({
      kind: "card" as const,
      id: card.id,
      card,
      order: hasTemplate && card.order <= templateOrder ? card.order + 1 : card.order,
    }));
  items.push(...cardItems);
  return items.sort((a, b) => {
    const order = a.order - b.order;
    if (order !== 0) return order;
    if (a.kind !== b.kind) return a.kind === "template" ? -1 : 1;
    if (a.kind === "card" && b.kind === "card") {
      return compareStreamCards(a.card, b.card);
    }
    return 0;
  });
}

function sortPosts(cards: CardData[]): CardData[] {
  return [...cards].sort(compareStreamCards);
}

function compareStreamCards(a: CardData, b: CardData): number {
  const byOrder = a.order - b.order;
  if (byOrder !== 0) return byOrder;
  return (
    new Date(a.createdAt ?? 0).getTime() -
    new Date(b.createdAt ?? 0).getTime()
  );
}

function buildInitialBreakoutState(
  sections: StreamSection[],
  canManage: boolean,
): Record<string, BreakoutState> {
  const result: Record<string, BreakoutState> = {};
  for (const section of sections) {
    const state = buildBreakoutStateFromSection(section, canManage);
    if (state) result[section.id] = state;
  }
  return result;
}

function buildBreakoutStateFromSection(
  section: StreamSection,
  canManage: boolean,
): BreakoutState | null {
  if (!section.breakout) return null;
  return {
    config: {
      groupCount: section.breakout.groupCount,
      groupCapacity: section.breakout.groupCapacity,
      joinMode:
        section.breakout.joinMode === "teacher_assign"
          ? "teacher_assign"
          : "student_select",
    },
    groups: section.breakout.groups,
    membership: null,
    canManage,
  };
}

function normalizeBreakoutStateForViewer(
  state: BreakoutState,
  isStudentViewer: boolean,
): BreakoutState {
  if (!isStudentViewer || !state.canManage) return state;
  return { ...state, canManage: false };
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

function isSectionSlideshowEnabled(section: StreamSection): boolean {
  return (
    normalizeStreamActivityTemplateState(section.activityTemplateState)
      .slideshowEnabled !== false
  );
}

function getSectionWritingGuidance(section: StreamSection): {
  titlePrompt: string;
  contentPrompt: string;
} {
  const state = normalizeStreamActivityTemplateState(section.activityTemplateState);
  return {
    titlePrompt: state.streamTitlePrompt?.trim() ?? "",
    contentPrompt: state.streamContentPrompt?.trim() ?? "",
  };
}

function isGuideCard(card: CardData): boolean {
  return !!card.guidePinned && isTeacherAuthoredCard(card);
}

function getSlideshowCards(cards: CardData[]): CardData[] {
  return cards.filter((card) => !isGuideCard(card));
}

function isTeacherAuthoredCard(card: CardData): boolean {
  return !!card.authorId && !card.studentAuthorId;
}

function canToggleGuideCard(card: CardData, canManageBoard: boolean): boolean {
  return canManageBoard && !!card.sectionId && isTeacherAuthoredCard(card);
}

function cardStudentIds(card: CardData): string[] {
  const ids: string[] = [];
  if (card.studentAuthorId) ids.push(card.studentAuthorId);
  for (const author of card.authors ?? []) {
    if (author.studentId && !ids.includes(author.studentId)) {
      ids.push(author.studentId);
    }
  }
  return ids;
}

function cardHasAnyStudentAuthor(card: CardData): boolean {
  return cardStudentIds(card).length > 0;
}

function cardHasStudentAuthor(card: CardData, studentId: string): boolean {
  return cardStudentIds(card).includes(studentId);
}

function getGroupIdForCardAuthors(
  card: CardData,
  groupIdByStudentId: Map<string, string>,
): string | null {
  for (const studentId of cardStudentIds(card)) {
    const groupId = groupIdByStudentId.get(studentId);
    if (groupId) return groupId;
  }
  return null;
}

function resolveCardBreakoutGroupId(
  card: CardData,
  groups: BreakoutGroup[],
): string | null {
  if (card.groupId) return card.groupId;
  const groupIdByStudentId = new Map<string, string>();
  for (const group of groups) {
    for (const member of group.members ?? []) {
      groupIdByStudentId.set(member.studentId, group.id);
    }
  }
  return getGroupIdForCardAuthors(card, groupIdByStudentId);
}

function formatBreakoutMemberName(member: BreakoutGroupMember): string {
  return member.studentNumber != null
    ? `${member.studentNumber}번 ${member.studentName}`
    : member.studentName;
}

type StreamBreakoutBodyProps = {
  section: StreamSection;
  bucket: CardData[];
  guideCards: CardData[];
  state: BreakoutState;
  activeGroup: string;
  busy: boolean;
  boardId: string;
  canAddPost: boolean;
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  currentStudentName?: string | null;
  isStudentViewer: boolean;
  onSetActiveGroup: (group: string) => void;
  onJoin: (groupId: string) => Promise<boolean>;
  onRemoveMember: (membershipId: string) => Promise<boolean>;
  onCreateCard: (
    data: { title: string; content: string },
    groupId: string | null,
  ) => Promise<void>;
  onSectionActivityStateChange?: (
    sectionId: string,
    activityTemplateState: StreamActivityTemplateState | null,
  ) => Promise<boolean>;
  onEditCard: (card: CardData) => void;
  onOpenCard: (card: CardData) => void;
  onDeleteCard: (card: CardData) => void;
  onToggleGuide: (card: CardData, guidePinned: boolean) => void;
  guideBusyId: string | null;
};

function StreamBreakoutBody({
  section,
  bucket,
  guideCards,
  state,
  activeGroup,
  busy,
  boardId,
  canAddPost,
  currentUserId,
  currentRole,
  currentStudentName,
  isStudentViewer,
  onSetActiveGroup,
  onJoin,
  onRemoveMember,
  onCreateCard,
  onSectionActivityStateChange,
  onEditCard,
  onOpenCard,
  onDeleteCard,
  onToggleGuide,
  guideBusyId,
}: StreamBreakoutBodyProps) {
  const groups = [...state.groups].sort((a, b) => a.order - b.order);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Record<string, boolean>>({});

  function groupCards(groupId: string | null): CardData[] {
    return bucket.filter((c) => resolveCardBreakoutGroupId(c, groups) === groupId);
  }

  function renderGroupArea(group: BreakoutGroup | null, cards: CardData[]) {
    const groupId = group?.id ?? null;
    const groupKey = group?.id ?? "__unassigned";
    const canCollapsePosts = !section.activityTemplate && cards.length > 1;
    const expanded = expandedGroupKeys[groupKey] === true;
    const visibleCards = canCollapsePosts && !expanded ? cards.slice(0, 1) : cards;
    return (
      <div className="stream-breakout-group-area" key={groupKey}>
        <div className="stream-breakout-group-area-head">
          <div className="stream-breakout-group-title-row">
            <span className="stream-breakout-group-area-name">
              {group?.name ?? "미지정"}
            </span>
            {group && (
              <span className="stream-breakout-group-area-count">
                {group.memberCount}명
              </span>
            )}
            {canCollapsePosts && (
              <button
                type="button"
                className="stream-breakout-group-post-toggle"
                aria-expanded={expanded}
                onClick={() =>
                  setExpandedGroupKeys((prev) => ({
                    ...prev,
                    [groupKey]: !expanded,
                  }))
                }
              >
                {expanded ? "접기" : `게시글 ${cards.length}개 펼치기`}
              </button>
            )}
            {group && group.members && group.members.length > 0 && (
              <div className="stream-breakout-member-list" aria-label={`${group.name} 학생`}>
                {group.members.map((member) => (
                  <span className="stream-breakout-member-chip" key={member.id}>
                    <span>{formatBreakoutMemberName(member)}</span>
                    {state.canManage && (
                      <button
                        type="button"
                        aria-label={`${member.studentName} 모둠에서 내보내기`}
                        onClick={() => void onRemoveMember(member.id)}
                        disabled={busy}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {section.activityTemplate && (
          <StreamActivityTemplatePanel
            template={section.activityTemplate}
            sectionId={section.id}
            cards={cards}
            canEdit={state.canManage || canAddPost}
            isTeacherView={state.canManage}
            windowMemberCount={group?.memberCount}
            windowMemberNames={group?.members?.map((member) => member.studentName)}
            windowCurrentMemberName={state.canManage ? null : currentStudentName}
            state={section.activityTemplateState ?? null}
            canEditCard={(card) => canDeleteCard(card, currentUserId, currentRole)}
            onEditCard={onEditCard}
            onDeleteCard={onDeleteCard}
            onStateChange={(nextState) =>
              onSectionActivityStateChange?.(section.id, nextState) ??
              Promise.resolve(false)
            }
            onCreateCard={(data) => onCreateCard(data, groupId)}
          />
        )}
        {!section.activityTemplate &&
          (cards.length === 0 ? (
            <div className="stream-section-empty">아직 게시글이 없어요.</div>
          ) : (
            <div
              className={`stream-post-grid${expanded ? " stream-post-masonry" : ""}`}
            >
              {visibleCards.map((card) => (
                <StreamPost
                  key={card.id}
                  card={card}
                  canEdit={canDeleteCard(card, currentUserId, currentRole)}
                  onEdit={() => onEditCard(card)}
                  onOpen={() => onOpenCard(card)}
                  canDelete={canDeleteCard(card, currentUserId, currentRole)}
                  onDelete={() => onDeleteCard(card)}
                  canToggleGuide={canToggleGuideCard(card, state.canManage)}
                  guideBusy={guideBusyId === card.id}
                  onToggleGuide={(guidePinned) => onToggleGuide(card, guidePinned)}
                  boardId={boardId}
                  isStudentViewer={isStudentViewer}
                />
              ))}
            </div>
          ))}
      </div>
    );
  }

  // Student flow: students now enter after teacher assignment. If membership
  // has not arrived yet, show the available section surface without a lock.
  if (!state.canManage) {
    if (!state.membership) {
      const previewCards = groupCards(null);
      const previewMemberCount =
        Math.max(0, ...groups.map((group) => group.memberCount)) || undefined;
      return (
        <div className="stream-breakout-group-view">
          <StreamGuideList
            cards={guideCards}
            boardId={boardId}
            currentUserId={currentUserId}
            currentRole={currentRole}
            canToggleGuide={false}
            isStudentViewer={isStudentViewer}
            guideBusyId={guideBusyId}
            onEditCard={onEditCard}
            onOpenCard={onOpenCard}
            onDeleteCard={onDeleteCard}
            onToggleGuide={onToggleGuide}
          />
          {section.activityTemplate ? (
            <StreamActivityTemplatePanel
              template={section.activityTemplate}
              sectionId={section.id}
              cards={previewCards}
              canEdit={canAddPost}
              isTeacherView={false}
              windowMemberCount={previewMemberCount}
              windowCurrentMemberName={currentStudentName}
              state={section.activityTemplateState ?? null}
              onCreateCard={(data) => onCreateCard(data, null)}
            />
          ) : previewCards.length === 0 ? (
            <div className="stream-section-empty">아직 게시글이 없어요.</div>
          ) : (
            <div className="stream-post-grid">
              {previewCards.map((card) => (
                <StreamPost
                  key={card.id}
                  card={card}
                  canEdit={false}
                  onEdit={() => undefined}
                  onOpen={() => onOpenCard(card)}
                  canDelete={false}
                  onDelete={() => onDeleteCard(card)}
                  boardId={boardId}
                  isStudentViewer={isStudentViewer}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    const myGroupId = state.membership.groupId;
    const myGroup = groups.find((g) => g.id === myGroupId) ?? null;
    const cards = groupCards(myGroupId);
    const myGroupExpanded = expandedGroupKeys[myGroupId] === true;
    const canCollapseMyGroupPosts = !section.activityTemplate && cards.length > 1;
    const visibleMyGroupCards =
      canCollapseMyGroupPosts && !myGroupExpanded ? cards.slice(0, 1) : cards;
    const myGroupGuideList = (
      <StreamGuideList
        cards={guideCards}
        boardId={boardId}
        currentUserId={currentUserId}
        currentRole={currentRole}
        canToggleGuide={false}
        isStudentViewer={isStudentViewer}
        guideBusyId={guideBusyId}
        onEditCard={onEditCard}
        onOpenCard={onOpenCard}
        onDeleteCard={onDeleteCard}
        onToggleGuide={onToggleGuide}
      />
    );
    return (
      <div className="stream-breakout-group-view">
        {myGroupGuideList}
        <div className="stream-breakout-my-group">
          <span>{myGroup?.name ?? "내 모둠"}</span>
          {myGroup && <span>{myGroup.memberCount}명</span>}
          {canCollapseMyGroupPosts && (
            <button
              type="button"
              className="stream-breakout-group-post-toggle"
              aria-expanded={myGroupExpanded}
              onClick={() =>
                setExpandedGroupKeys((prev) => ({
                  ...prev,
                  [myGroupId]: !myGroupExpanded,
                }))
              }
            >
              {myGroupExpanded ? "접기" : `게시글 ${cards.length}개 펼치기`}
            </button>
          )}
        </div>
        {section.activityTemplate && (
          <StreamActivityTemplatePanel
            template={section.activityTemplate}
            sectionId={section.id}
            cards={cards}
            canEdit={canAddPost}
            isTeacherView={false}
            windowMemberCount={myGroup?.memberCount}
            windowMemberNames={myGroup?.members?.map((member) => member.studentName)}
            windowCurrentMemberName={currentStudentName}
            state={section.activityTemplateState ?? null}
            canEditCard={(card) => canDeleteCard(card, currentUserId, currentRole)}
            onEditCard={onEditCard}
            onDeleteCard={onDeleteCard}
            onCreateCard={(data) => onCreateCard(data, myGroupId)}
          />
        )}
        {!section.activityTemplate &&
          (cards.length === 0 ? (
            <div className="stream-section-empty">아직 게시글이 없어요.</div>
          ) : (
            <div
              className={`stream-post-grid${
                myGroupExpanded ? " stream-post-masonry" : ""
              }`}
            >
              {visibleMyGroupCards.map((card) => (
                <StreamPost
                  key={card.id}
                  card={card}
                  canEdit={canDeleteCard(card, currentUserId, currentRole)}
                  onEdit={() => onEditCard(card)}
                  onOpen={() => onOpenCard(card)}
                  canDelete={canDeleteCard(card, currentUserId, currentRole)}
                  onDelete={() => onDeleteCard(card)}
                  boardId={boardId}
                  isStudentViewer={isStudentViewer}
                />
              ))}
            </div>
          ))}
      </div>
    );
  }

  // Teacher flow: segment bar + compare or single-group view.
  const unassigned = groupCards(null);
  const teacherGuideList = (
    <StreamGuideList
      cards={guideCards}
      boardId={boardId}
      currentUserId={currentUserId}
      currentRole={currentRole}
      canToggleGuide={state.canManage}
      isStudentViewer={isStudentViewer}
      guideBusyId={guideBusyId}
      onEditCard={onEditCard}
      onOpenCard={onOpenCard}
      onDeleteCard={onDeleteCard}
      onToggleGuide={onToggleGuide}
    />
  );
  return (
    <div className="stream-breakout-teacher">
      <div className="stream-breakout-segments" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeGroup === "all"}
          className={activeGroup === "all" ? "is-active" : ""}
          onClick={() => onSetActiveGroup("all")}
        >
          전체
        </button>
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            role="tab"
            aria-selected={activeGroup === group.id}
            className={activeGroup === group.id ? "is-active" : ""}
            onClick={() => onSetActiveGroup(group.id)}
          >
            {group.name}
          </button>
        ))}
      </div>
      {teacherGuideList}
      {activeGroup === "all" ? (
        <div className="stream-breakout-compare">
          {groups.map((group) => renderGroupArea(group, groupCards(group.id)))}
          {unassigned.length > 0 && renderGroupArea(null, unassigned)}
        </div>
      ) : (
        <div className="stream-breakout-group-view">
          {renderGroupArea(
            groups.find((g) => g.id === activeGroup) ?? null,
            groupCards(activeGroup),
          )}
        </div>
      )}
    </div>
  );
}

function groupsFromBreakoutState(
  state: BreakoutState | undefined,
): GroupEditorDraft[] {
  if (!state?.groups.length) return defaultBreakoutGroups([]);
  return [...state.groups]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      name: group.name,
      studentIds: (group.members ?? []).map((member) => member.studentId),
    }));
}

function studentsFromBreakoutState(
  state: BreakoutState | undefined,
): GroupEditorStudent[] {
  const byId = new Map<string, GroupEditorStudent>();
  for (const group of state?.groups ?? []) {
    for (const member of group.members ?? []) {
      byId.set(member.studentId, {
        id: member.studentId,
        name: member.studentName,
        number: member.studentNumber,
      });
    }
  }
  return [...byId.values()].sort((a, b) => {
    if (a.number == null && b.number == null) return a.name.localeCompare(b.name);
    if (a.number == null) return 1;
    if (b.number == null) return -1;
    return a.number - b.number;
  });
}

function defaultBreakoutGroups(
  students: GroupEditorStudent[],
): GroupEditorDraft[] {
  const count = Math.max(1, Math.min(4, students.length || 1));
  const groups = Array.from({ length: count }, (_, index) => ({
    name: `${index + 1}모둠`,
    studentIds: [] as string[],
  }));
  students.forEach((student, index) => {
    groups[index % count].studentIds.push(student.id);
  });
  return groups;
}

function BreakoutConfigModal({
  boardId,
  section,
  state,
  busy,
  onClose,
  onSave,
  onDisable,
}: {
  boardId: string;
  section: StreamSection;
  state: BreakoutState | undefined;
  busy: boolean;
  onClose: () => void;
  onSave: (groups: GroupEditorDraft[]) => Promise<boolean>;
  onDisable: () => Promise<boolean>;
}) {
  const [students, setStudents] = useState<GroupEditorStudent[]>([]);
  const [groups, setGroups] = useState<GroupEditorDraft[]>(() =>
    groupsFromBreakoutState(state),
  );
  const [loading, setLoading] = useState(!state?.config);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");
    try {
      await onSave(groups);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadDefaults() {
      setLoading(true);
      setStatus("");
      try {
        const res = await fetch(`/api/boards/${boardId}/default-groups`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as {
          students: GroupEditorStudent[];
          groups: GroupEditorDraft[];
        };
        if (!cancelled) {
          setStudents(data.students ?? []);
          setGroups(
            state?.config
              ? groupsFromBreakoutState(state)
              : data.groups.length > 0
              ? data.groups
              : defaultBreakoutGroups(data.students ?? []),
          );
        }
      } catch {
        if (!cancelled) {
          setStudents(studentsFromBreakoutState(state));
          setGroups(groupsFromBreakoutState(state));
          setStatus("기본 모둠을 불러오지 못했어요. 여기서 직접 설정할 수 있어요.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadDefaults();
    return () => {
      cancelled = true;
    };
  }, [boardId, state]);

  const disabled = busy || submitting || loading;

  async function disableBreakout() {
    if (!state?.config || disabled) return;
    setSubmitting(true);
    try {
      await onDisable();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={disabled ? undefined : onClose} />
      <div
        className="add-card-modal stream-breakout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stream-breakout-modal-title"
      >
        <form onSubmit={submit}>
          <div className="modal-header">
            <h2 className="modal-title" id="stream-breakout-modal-title">
              모둠활동 설정
            </h2>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              disabled={disabled}
              aria-label="닫기"
            >
              ×
            </button>
          </div>
          <div className="modal-body">
            <p className="stream-template-modal-section">{section.title}</p>
            {loading ? (
              <p className="stream-breakout-modal-hint">기본 모둠을 불러오는 중...</p>
            ) : (
              <GroupRosterEditor
                students={students}
                groups={groups}
                onChange={setGroups}
                disabled={disabled}
              />
            )}
            <p className="stream-breakout-modal-hint">
              {state?.config
                ? "이 변경은 이 섹션의 모둠활동에만 적용됩니다."
                : "학급 기본 모둠을 가져왔어요. 여기서 바꿔도 이 섹션에만 적용됩니다."}
            </p>
            {status && <p className="stream-breakout-modal-hint">{status}</p>}
            <div className="stream-template-modal-actions stream-breakout-modal-actions">
              {state?.config && (
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={disableBreakout}
                  disabled={disabled}
                >
                  모둠활동 해제
                </button>
              )}
              <button type="submit" className="modal-btn-submit" disabled={disabled}>
                저장
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
