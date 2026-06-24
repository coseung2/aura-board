"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { AddCardData } from "./AddCardModal";
import type { CardData } from "./DraggableCard";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GroupIcon,
  PencilIcon,
  TemplateIcon,
  TrashIcon,
} from "./icons/UiIcons";
import { SectionActionsPanel } from "./SectionActionsPanel";
import { StreamComposer } from "./stream/StreamComposer";
import { StreamActivityTemplatePanel } from "./stream/StreamActivityTemplatePanel";
import { StreamPost } from "./stream/StreamPost";
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
  joinMode: "student_select";
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
  const [sectionOrderBusyId, setSectionOrderBusyId] = useState<string | null>(null);
  const [contentOrderBusyId, setContentOrderBusyId] = useState<string | null>(null);
  const canEdit = currentRole === "owner" || currentRole === "editor";
  const canManageSections = canEdit && !isStudentViewer;
  const canAddPost = canEdit || !!isStudentViewer;
  const [breakoutBySection, setBreakoutBySection] = useState<Record<string, BreakoutState>>(() =>
    buildInitialBreakoutState(initialSections, canManageSections),
  );
  const [breakoutBusyId, setBreakoutBusyId] = useState<string | null>(null);
  const [breakoutModalSectionId, setBreakoutModalSectionId] = useState<string | null>(null);
  const [activeGroupBySection, setActiveGroupBySection] = useState<Record<string, string>>({});
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
            prev[section.id] !== undefined
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
  }, [sortedSections, streamSectionsEnabled, isStudentViewer]);

  function visibleCardsForSection(sectionId: string, bucket: CardData[]): CardData[] {
    const bs = breakoutBySection[sectionId];
    if (!bs || !bs.config) return bucket;
    if (!bs.canManage) {
      // Students only see their own group; before joining, nothing.
      if (!bs.membership) return [];
      return bucket.filter((c) => (c.groupId ?? null) === bs.membership!.groupId);
    }
    const active = activeGroupBySection[sectionId] ?? "all";
    if (active === "all") return bucket;
    return bucket.filter((c) => (c.groupId ?? null) === active);
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

  const sectionOptions = useMemo(
    () => sortedSections.map((s) => ({ id: s.id, title: s.title })),
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
        const bucket = visibleBySection.get(section.id) ?? [];
        slides.push({
          id: `section:${section.id}`,
          kind: "section",
          sectionId: section.id,
          sectionTitle: section.title,
        });
        if (section.activityTemplate) {
          slides.push({
            id: `activity:${section.id}:${section.activityTemplate}`,
            kind: "activity",
            sectionId: section.id,
            sectionTitle: section.title,
            activityTemplate: section.activityTemplate,
            activityTemplateState: section.activityTemplateState ?? null,
            cards: bucket,
          });
        } else {
          for (const card of bucket) slides.push({ id: card.id, kind: "card", card });
        }
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
  }, [cards, sortedSections, visibleBySection, streamSectionsEnabled, registerSlides, unregisterSlides]);

  useEffect(() => {
    if (!streamSectionsEnabled) {
      setSectionOptions("stream", []);
      return;
    }
    const options: SlideshowSectionOption[] = sortedSections
      .map((section) => {
        const state = breakoutBySection[section.id];
        const groups = state?.config
          ? [...state.groups]
              .sort((a, b) => a.order - b.order)
              .map((group) => ({ groupId: group.id, name: group.name }))
          : [];
        return { sectionId: section.id, title: section.title, groups };
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
    const siblingOrders = cards
      .filter(
        (card) =>
          (card.sectionId ?? null) === sectionId &&
          (card.groupId ?? null) === (groupId ?? null),
      )
      .map((card) => card.order);
    const nextOrder =
      siblingOrders.length > 0 ? Math.max(...siblingOrders) + 1 : 0;
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
        order: nextOrder,
        sectionId,
        groupId: groupId ?? null,
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
    const activityTemplateState =
      activityTemplate === "word_cloud" ? { wordCloudPublished: false } : null;
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

  async function handleSectionActivityStateChange(
    sectionId: string,
    activityTemplateState: StreamActivityTemplateState | null,
  ): Promise<boolean> {
    const prev = sections;
    setSections((list) =>
      list.map((s) =>
        s.id === sectionId ? { ...s, activityTemplateState } : s,
      ),
    );
    try {
      const res = await fetch(`/api/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityTemplateState }),
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
    groupCount: number,
    groupCapacity: number,
  ): Promise<boolean> {
    setBreakoutBusyId(sectionId);
    try {
      const res = await fetch(`/api/sections/${sectionId}/breakout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupCount,
          groupCapacity,
          joinMode: "student_select",
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
      setBreakoutBySection((prev) => ({ ...prev, [sectionId]: data }));
      setActiveGroupBySection((prev) => ({ ...prev, [sectionId]: "all" }));
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
          card.studentAuthorId === currentUserId &&
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

  function openComposer(sectionId?: string | null) {
    setComposerSectionId(sectionId ?? null);
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
            card.studentAuthorId === removedMember.studentId &&
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
            sectionOrderBusyId={sectionOrderBusyId}
            contentOrderBusyId={contentOrderBusyId}
            breakoutBySection={breakoutBySection}
            activeGroupBySection={activeGroupBySection}
            breakoutBusyId={breakoutBusyId}
            onSetActiveGroup={(sectionId, group) =>
              setActiveGroupBySection((prev) => ({ ...prev, [sectionId]: group }))
            }
            onJoinBreakout={handleJoinBreakout}
            onRemoveBreakoutMember={handleRemoveBreakoutMember}
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
        breakoutModalSectionId &&
        (() => {
          const section = sections.find((s) => s.id === breakoutModalSectionId);
          if (!section) return null;
          const state = breakoutBySection[section.id];
          return createPortal(
            <BreakoutConfigModal
              section={section}
              state={state}
              busy={breakoutBusyId === section.id}
              onClose={() => setBreakoutModalSectionId(null)}
              onSave={async (groupCount, groupCapacity) => {
                const ok = await handleSaveBreakout(section.id, groupCount, groupCapacity);
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
  isAddingSection: boolean;
  newSectionTitle: string;
  sectionAddBusy: boolean;
  sectionAddError: string | null;
  onStartAddSection: () => void;
  onCancelAddSection: () => void;
  onSectionTitleChange: (title: string) => void;
  onSubmitSection: (event: FormEvent<HTMLFormElement>) => void;
  onOpenSectionPanel: (sectionId: string, tab: "rename" | "delete") => void;
  onMoveSection: (sectionId: string, direction: "up" | "down") => Promise<void>;
  onOpenTemplateModal: (sectionId: string) => void;
  onOpenBreakoutModal: (sectionId: string) => void;
  onOpenComposerForSection: (sectionId: string) => void;
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
  sectionOrderBusyId: string | null;
  contentOrderBusyId: string | null;
  breakoutBySection: Record<string, BreakoutState>;
  activeGroupBySection: Record<string, string>;
  breakoutBusyId: string | null;
  onSetActiveGroup: (sectionId: string, group: string) => void;
  onJoinBreakout: (sectionId: string, groupId: string) => Promise<boolean>;
  onRemoveBreakoutMember: (
    sectionId: string,
    membershipId: string,
  ) => Promise<boolean>;
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
  isStudentViewer,
  isAddingSection,
  newSectionTitle,
  sectionAddBusy,
  sectionAddError,
  onStartAddSection,
  onCancelAddSection,
  onSectionTitleChange,
  onSubmitSection,
  onOpenSectionPanel,
  onMoveSection,
  onOpenTemplateModal,
  onOpenBreakoutModal,
  onOpenComposerForSection,
  onSectionActivityStateChange,
  onCreateSectionCard,
  onMoveSectionContent,
  templateBusySectionId,
  sectionOrderBusyId,
  contentOrderBusyId,
  breakoutBySection,
  activeGroupBySection,
  breakoutBusyId,
  onSetActiveGroup,
  onJoinBreakout,
  onRemoveBreakoutMember,
  onDeleteCard,
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
        const contentItems = buildSectionContentItems(section, bucket);
        const orderBusy = sectionOrderBusyId !== null;
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
                  onClick={() => onOpenComposerForSection(section.id)}
                >
                  + 게시글 추가
                </button>
              </div>
            )}
            {hasBreakout && breakout ? (
              <StreamBreakoutBody
                section={section}
                bucket={bucket}
                state={breakout}
                activeGroup={activeGroupBySection[section.id] ?? "all"}
                busy={breakoutBusyId === section.id}
                boardId={boardId}
                canAddPost={canAddPost}
                currentUserId={currentUserId}
                currentRole={currentRole}
                onSetActiveGroup={(group) => onSetActiveGroup(section.id, group)}
                onJoin={(groupId) => onJoinBreakout(section.id, groupId)}
                onRemoveMember={(membershipId) =>
                  onRemoveBreakoutMember(section.id, membershipId)
                }
                onCreateCard={(data, groupId) =>
                  onCreateSectionCard(section.id, data, groupId)
                }
                onSectionActivityStateChange={onSectionActivityStateChange}
                onDeleteCard={onDeleteCard}
              />
            ) : contentItems.length === 0 ? (
              <div className="stream-section-empty">아직 게시글이 없어요.</div>
            ) : (
              contentItems.map((item, itemIndex) => (
               <StreamSectionContentItem
                 key={item.id}
                 item={item}
                 itemIndex={itemIndex}
                 itemCount={contentItems.length}
                 section={section}
                 cards={bucket}
                 canReorder={canAddPost}
                 canEditTemplate={canAddPost}
                 isTeacherView={canEdit}
                 orderBusyId={contentOrderBusyId}
                 boardId={boardId}
                 currentUserId={currentUserId}
                 currentRole={currentRole}
                 onMove={(id, direction) =>
                   onMoveSectionContent(section, contentItems, id, direction)
                 }
                 onDeleteCard={onDeleteCard}
                 onSectionActivityStateChange={onSectionActivityStateChange}
                 onCreateSectionCard={onCreateSectionCard}
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

    </>
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
  boardId,
  currentUserId,
  currentRole,
  onMove,
  onDeleteCard,
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
  boardId: string;
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
  onMove: (itemId: string, direction: "up" | "down") => Promise<void>;
  onDeleteCard: (card: CardData) => void;
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
          state={section.activityTemplateState ?? null}
          onStateChange={(nextState) =>
            onSectionActivityStateChange(section.id, nextState)
          }
          onCreateCard={(data) => onCreateSectionCard(section.id, data)}
        />
      ) : (
        <StreamPost
          card={item.card}
          canDelete={canDeleteCard(item.card, currentUserId, currentRole)}
          onDelete={() => onDeleteCard(item.card)}
          boardId={boardId}
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
      joinMode: "student_select",
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

function formatBreakoutMemberName(member: BreakoutGroupMember): string {
  return member.studentNumber != null
    ? `${member.studentNumber}번 ${member.studentName}`
    : member.studentName;
}

type StreamBreakoutBodyProps = {
  section: StreamSection;
  bucket: CardData[];
  state: BreakoutState;
  activeGroup: string;
  busy: boolean;
  boardId: string;
  canAddPost: boolean;
  currentUserId: string;
  currentRole: "owner" | "editor" | "viewer";
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
  onDeleteCard: (card: CardData) => void;
};

function StreamBreakoutBody({
  section,
  bucket,
  state,
  activeGroup,
  busy,
  boardId,
  canAddPost,
  currentUserId,
  currentRole,
  onSetActiveGroup,
  onJoin,
  onRemoveMember,
  onCreateCard,
  onSectionActivityStateChange,
  onDeleteCard,
}: StreamBreakoutBodyProps) {
  const groups = [...state.groups].sort((a, b) => a.order - b.order);

  function groupCards(groupId: string | null): CardData[] {
    return bucket.filter((c) => (c.groupId ?? null) === groupId);
  }

  function renderGroupArea(group: BreakoutGroup | null, cards: CardData[]) {
    const groupId = group?.id ?? null;
    return (
      <div className="stream-breakout-group-area" key={group?.id ?? "__unassigned"}>
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
            state={section.activityTemplateState ?? null}
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
            cards.map((card) => (
              <StreamPost
                key={card.id}
                card={card}
                canDelete={canDeleteCard(card, currentUserId, currentRole)}
                onDelete={() => onDeleteCard(card)}
                boardId={boardId}
              />
            ))
          ))}
      </div>
    );
  }

  // Student flow: pick a group before seeing anything group-specific.
  if (!state.canManage) {
    if (!state.membership) {
      const capacity = state.config?.groupCapacity ?? 0;
      const previewCards = groupCards(null);
      const previewMemberCount =
        capacity > 0
          ? capacity
          : Math.max(0, ...groups.map((group) => group.memberCount));
      return (
        <div className="stream-breakout-locked">
          <div className="stream-breakout-locked-content" aria-hidden="true" inert>
            {section.activityTemplate ? (
              <StreamActivityTemplatePanel
                template={section.activityTemplate}
                sectionId={section.id}
                cards={previewCards}
                canEdit={canAddPost}
                isTeacherView={false}
                windowMemberCount={previewMemberCount || undefined}
                state={section.activityTemplateState ?? null}
                onCreateCard={() => Promise.resolve()}
              />
            ) : previewCards.length === 0 ? (
              <div className="stream-section-empty">아직 게시글이 없어요.</div>
            ) : (
              previewCards.map((card) => (
                <StreamPost
                  key={card.id}
                  card={card}
                  canDelete={false}
                  onDelete={() => onDeleteCard(card)}
                  boardId={boardId}
                />
              ))
            )}
          </div>
          <div className="stream-breakout-join-overlay">
            <p className="stream-breakout-join-title">참여할 모둠을 선택하세요</p>
            <div className="stream-breakout-join-grid">
              {groups.map((group) => {
                const full = capacity > 0 && group.memberCount >= capacity;
                return (
                  <button
                    key={group.id}
                    type="button"
                    className="stream-breakout-join-card"
                    disabled={busy || full}
                    onClick={() => void onJoin(group.id)}
                  >
                    <span className="stream-breakout-join-name">{group.name}</span>
                    <span className="stream-breakout-join-count">
                      {group.memberCount}명{full ? " · 정원 초과" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    const myGroupId = state.membership.groupId;
    const myGroup = groups.find((g) => g.id === myGroupId) ?? null;
    const cards = groupCards(myGroupId);
    return (
      <div className="stream-breakout-group-view">
        <div className="stream-breakout-my-group">
          <span>{myGroup?.name ?? "내 모둠"}</span>
          {myGroup && <span>{myGroup.memberCount}명</span>}
        </div>
        {section.activityTemplate && (
          <StreamActivityTemplatePanel
            template={section.activityTemplate}
            sectionId={section.id}
            cards={cards}
            canEdit={canAddPost}
            isTeacherView={false}
            windowMemberCount={myGroup?.memberCount}
            state={section.activityTemplateState ?? null}
            onCreateCard={(data) => onCreateCard(data, myGroupId)}
          />
        )}
        {!section.activityTemplate &&
          (cards.length === 0 ? (
            <div className="stream-section-empty">아직 게시글이 없어요.</div>
          ) : (
            cards.map((card) => (
              <StreamPost
                key={card.id}
                card={card}
                canDelete={canDeleteCard(card, currentUserId, currentRole)}
                onDelete={() => onDeleteCard(card)}
                boardId={boardId}
              />
            ))
          ))}
      </div>
    );
  }

  // Teacher flow: segment bar + compare or single-group view.
  const unassigned = groupCards(null);
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

function BreakoutConfigModal({
  section,
  state,
  busy,
  onClose,
  onSave,
  onDisable,
}: {
  section: StreamSection;
  state: BreakoutState | undefined;
  busy: boolean;
  onClose: () => void;
  onSave: (groupCount: number, groupCapacity: number) => Promise<boolean>;
  onDisable: () => Promise<boolean>;
}) {
  const [groupCount, setGroupCount] = useState(state?.config?.groupCount ?? 4);
  const [groupCapacity, setGroupCapacity] = useState(
    state?.config?.groupCapacity ?? 4,
  );
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const gc = Math.min(12, Math.max(1, Math.round(Number(groupCount) || 1)));
    const gcap = Math.min(50, Math.max(1, Math.round(Number(groupCapacity) || 1)));
    setGroupCount(gc);
    setGroupCapacity(gcap);
    setSubmitting(true);
    try {
      await onSave(gc, gcap);
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = busy || submitting;

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
              모둠 활동 설정
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
            <div className="stream-breakout-form">
              <label className="stream-breakout-field">
               <span>모둠 수</span>
               <input
                 type="number"
                 min={1}
                 max={12}
                 value={groupCount}
                 onChange={(e) => setGroupCount(Number(e.target.value))}
                 disabled={disabled}
               />
             </label>
             <label className="stream-breakout-field">
                <span>모둠 정원</span>
               <input
                 type="number"
                 min={1}
                 max={50}
                 value={groupCapacity}
                  onChange={(e) => setGroupCapacity(Number(e.target.value))}
                  disabled={disabled}
                />
              </label>
            </div>
            <p className="stream-breakout-modal-hint">
             {state?.config
                ? `현재 ${state.config.groupCount}모둠 · 정원 ${state.config.groupCapacity ?? "-"}명 · 학생이 직접 모둠을 선택합니다.`
               : "저장하면 학생이 섹션에서 모둠을 선택할 수 있어요."}
            </p>
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
