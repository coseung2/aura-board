import type { BoardTheme } from "@/components/BoardSettingsPanel";
import type { BreakoutState } from "@/components/stream/stream-board-model";

export type SectionBreakoutConfigRow = {
  sectionId: string;
  groupCount: number;
  groupCapacity: number | null;
  joinMode: string;
};
export type SectionBreakoutGroupRow = {
  id: string;
  sectionId: string;
  name: string;
  order: number;
  _count: { members: number };
  members: {
    id: string;
    studentId: string;
    student: { id: string; name: string; number: number | null };
  }[];
};

export function buildSectionBreakoutForPage(
  sectionId: string,
  configBySection: Map<string, SectionBreakoutConfigRow>,
  groupsBySection: Map<string, SectionBreakoutGroupRow[]>,
) {
  const cfg = configBySection.get(sectionId);
  if (!cfg) return null;
  const groups = (groupsBySection.get(sectionId) ?? []).map((g) => ({
    id: g.id,
    sectionId: g.sectionId,
    name: g.name,
    order: g.order,
    memberCount: g._count.members,
    members: g.members.map((member) => ({
      id: member.id,
      studentId: member.studentId,
      studentName: member.student.name,
      studentNumber: member.student.number,
    })),
  }));
  return {
    groupCount: cfg.groupCount,
    groupCapacity: cfg.groupCapacity,
    joinMode: cfg.joinMode,
    groups,
  };
}
export const normalizeBoardTheme = (
    value: string | null | undefined,
  ): BoardTheme => {
    switch (value) {
      case "pastel-peach":
      case "pastel-mint":
      case "pastel-sky":
      case "pastel-lilac":
      case "pastel-lemon":
        return value;
      default:
        return "pastel-sky";
    }
  };

export function decodeRouteParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
