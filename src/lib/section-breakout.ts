// Section-level breakout wire shape used by:
//   - GET/POST /api/sections/[id]/breakout
//   - GET/POST /api/sections/[id]/breakout/membership
//   - CardWire.groupId on the stream SSE
//   - SectionWire.breakout snapshot on the stream SSE and the board page
//
// Distinct from src/lib/breakout.ts which holds BreakoutAssignment /
// BreakoutTemplate board-level primitives. This file is the section-scoped
// counterpart: small group roster, student self-select, groupId tagging on
// cards. Keep it small and free of board-level template coupling.

export const MIN_GROUP_COUNT = 1;
export const MAX_GROUP_COUNT = 12;
export const MIN_GROUP_CAPACITY = 1;
export const MAX_GROUP_CAPACITY = 50;
export const DEFAULT_GROUP_CAPACITY = 6;

export const SECTION_BREAKOUT_JOIN_MODES = ["student_select"] as const;
export type SectionBreakoutJoinMode =
  (typeof SECTION_BREAKOUT_JOIN_MODES)[number];

export type SectionBreakoutConfigWire = {
  groupCount: number;
  groupCapacity: number | null;
  joinMode: SectionBreakoutJoinMode;
};

export type SectionBreakoutGroupWire = {
  id: string;
  sectionId: string;
  name: string;
  order: number;
  memberCount: number;
};

export type SectionBreakoutMembershipWire = {
  id: string;
  groupId: string;
  groupName: string;
  groupOrder: number;
  joinedAt: string;
};

// Default group name for an order slot. 0-indexed in storage, "1모둠…N모둠"
// in the wire to match Korean classroom vocabulary.
export function defaultGroupName(order: number): string {
  return `${order + 1}모둠`;
}
