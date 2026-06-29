import type { CardData } from "../DraggableCard";
import {
  normalizeStreamActivityTemplateState,
  type StreamActivityTemplate,
  type StreamActivityTemplateState,
} from "@/lib/stream-activity-templates";

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

export type StreamContentItem =
  | { kind: "template"; id: string; order: number }
  | { kind: "card"; id: string; card: CardData; order: number };

export function buildSectionContentItems(
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

export function sortPosts(cards: CardData[]): CardData[] {
  return [...cards].sort(compareStreamCards);
}

export function compareStreamCards(a: CardData, b: CardData): number {
  const byOrder = a.order - b.order;
  if (byOrder !== 0) return byOrder;
  return (
    new Date(a.createdAt ?? 0).getTime() -
    new Date(b.createdAt ?? 0).getTime()
  );
}

export function buildInitialBreakoutState(
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

export function buildBreakoutStateFromSection(
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

export function normalizeBreakoutStateForViewer(
  state: BreakoutState,
  isStudentViewer: boolean,
): BreakoutState {
  if (!isStudentViewer || !state.canManage) return state;
  return { ...state, canManage: false };
}

export function canDeleteCard(
  card: CardData,
  currentUserId: string,
  currentRole: "owner" | "editor" | "viewer",
): boolean {
  if (currentRole === "owner") return true;
  if (currentRole === "editor" && card.authorId === currentUserId) return true;
  return card.studentAuthorId === currentUserId;
}

export function isSectionSlideshowEnabled(section: StreamSection): boolean {
  return (
    normalizeStreamActivityTemplateState(section.activityTemplateState)
      .slideshowEnabled !== false
  );
}

export function getSectionWritingGuidance(section: StreamSection): {
  titlePrompt: string;
  contentPrompt: string;
} {
  const state = normalizeStreamActivityTemplateState(section.activityTemplateState);
  return {
    titlePrompt: state.streamTitlePrompt?.trim() ?? "",
    contentPrompt: state.streamContentPrompt?.trim() ?? "",
  };
}

export function isGuideCard(card: CardData): boolean {
  return !!card.guidePinned && isTeacherAuthoredCard(card);
}

export function getSlideshowCards(cards: CardData[]): CardData[] {
  return cards.filter((card) => !isGuideCard(card));
}

export function isTeacherAuthoredCard(card: CardData): boolean {
  return !!card.authorId && !card.studentAuthorId;
}

export function canToggleGuideCard(card: CardData, canManageBoard: boolean): boolean {
  return canManageBoard && !!card.sectionId && isTeacherAuthoredCard(card);
}

export function cardStudentIds(card: CardData): string[] {
  const ids: string[] = [];
  if (card.studentAuthorId) ids.push(card.studentAuthorId);
  for (const author of card.authors ?? []) {
    if (author.studentId && !ids.includes(author.studentId)) {
      ids.push(author.studentId);
    }
  }
  return ids;
}

export function cardHasAnyStudentAuthor(card: CardData): boolean {
  return cardStudentIds(card).length > 0;
}

export function cardHasStudentAuthor(card: CardData, studentId: string): boolean {
  return cardStudentIds(card).includes(studentId);
}

export function getGroupIdForCardAuthors(
  card: CardData,
  groupIdByStudentId: Map<string, string>,
): string | null {
  for (const studentId of cardStudentIds(card)) {
    const groupId = groupIdByStudentId.get(studentId);
    if (groupId) return groupId;
  }
  return null;
}

export function resolveCardBreakoutGroupId(
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

export function formatBreakoutMemberName(member: BreakoutGroupMember): string {
  return member.studentNumber != null
    ? `${member.studentNumber}번 ${member.studentName}`
    : member.studentName;
}
