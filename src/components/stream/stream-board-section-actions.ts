import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { CardData } from "../DraggableCard";
import type { GroupEditorDraft } from "../classroom/GroupRosterEditor";
import { withBoardAnonymousAuthor } from "@/lib/card-anonymity";
import { sortSections } from "@/lib/sort-sections";
import { normalizeStreamActivityTemplateState, type StreamActivityTemplate, type StreamActivityTemplateState } from "@/lib/stream-activity-templates";
import {
  buildBreakoutStateFromSection, buildSectionContentItems, cardHasAnyStudentAuthor,
  cardHasStudentAuthor, getGroupIdForCardAuthors, isGuideCard,
  isSectionSlideshowEnabled,
  normalizeBreakoutStateForViewer, resolveCardBreakoutGroupId, sortPosts,
  type BreakoutState, type StreamContentItem, type StreamSection,
} from "./stream-board-model";

type Context = {
  boardId: string;
  currentUserId: string;
  currentStudentName?: string | null;
  isStudentViewer?: boolean;
  anonymousAuthor: boolean;
  canManageSections: boolean;
  cards: CardData[];
  sections: StreamSection[];
  sortedSections: StreamSection[];
  breakoutBySection: Record<string, BreakoutState>;
  sectionSlideshowBusyId: string | null;
  sectionPromptBusyId: string | null;
  setCards: Dispatch<SetStateAction<CardData[]>>;
  setSections: Dispatch<SetStateAction<StreamSection[]>>;
  setOpenCard: Dispatch<SetStateAction<CardData | null>>;
  setEditingCard: Dispatch<SetStateAction<CardData | null>>;
  setTemplateBusySectionId: Dispatch<SetStateAction<string | null>>;
  setSectionSlideshowBusyId: Dispatch<SetStateAction<string | null>>;
  setSectionPromptBusyId: Dispatch<SetStateAction<string | null>>;
  setSectionOrderBusyId: Dispatch<SetStateAction<string | null>>;
  setContentOrderBusyId: Dispatch<SetStateAction<string | null>>;
  setGuideBusyId: Dispatch<SetStateAction<string | null>>;
  setBreakoutBusyId: Dispatch<SetStateAction<string | null>>;
  setBreakoutBySection: Dispatch<SetStateAction<Record<string, BreakoutState>>>;
  setActiveGroupBySection: Dispatch<SetStateAction<Record<string, string>>>;
  breakoutLoadedRef: MutableRefObject<Set<string>>;
  visibleCardsForSection: (sectionId: string, cards: CardData[]) => CardData[];
};

export function createStreamBoardSectionActions({
  boardId, currentUserId, currentStudentName, isStudentViewer, anonymousAuthor,
  canManageSections, cards, sections, sortedSections, breakoutBySection,
  sectionSlideshowBusyId, sectionPromptBusyId,
  setCards, setSections, setOpenCard, setEditingCard, setTemplateBusySectionId,
  setSectionSlideshowBusyId, setSectionPromptBusyId, setSectionOrderBusyId,
  setContentOrderBusyId, setGuideBusyId, setBreakoutBusyId, setBreakoutBySection,
  setActiveGroupBySection, breakoutLoadedRef, visibleCardsForSection,
}: Context) {
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


  return {
    handleSectionRenamed,
    handleSectionDeleted,
    handleMoveSection,
    handleSectionTemplateChange,
    handleSectionSlideshowToggle,
    handleSectionWritingGuidanceSave,
    handleSectionActivityStateChange,
    handleToggleGuide,
    handleMoveSectionContent,
    handleSaveBreakout,
    handleDisableBreakout,
    handleJoinBreakout,
  };
}
