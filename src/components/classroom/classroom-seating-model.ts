import type {
  GroupEditorDraft,
  GroupEditorStudent,
} from "./GroupRosterEditor";

export const GROUP_SIZE = 4;
export const PLACEMENT_STEP_MS = 110;
export const MIN_GROUP_COUNT = 1;

export type DropTarget =
  | { kind: "seat"; groupIndex: number; seatIndex: number }
  | { kind: "area"; groupIndex: number }
  | { kind: "unassigned" };

export type PairMode =
  | "any"
  | "mixed"
  | "same"
  | "male_male"
  | "female_female";

export type FixedPair = {
  id: string;
  studentIds: [string, string];
};

type StudentGender = "male" | "female";

export function isSameDropTarget(
  a: DropTarget | null,
  b: DropTarget | null,
): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "seat" && b.kind === "seat") {
    return a.groupIndex === b.groupIndex && a.seatIndex === b.seatIndex;
  }
  if (a.kind === "area" && b.kind === "area") {
    return a.groupIndex === b.groupIndex;
  }
  return true;
}

export function fixedPairId(a: string, b: string): string {
  return [a, b].sort().join("__");
}

export function genderOf(
  student: GroupEditorStudent | undefined,
): StudentGender | null {
  return student?.gender === "male" || student?.gender === "female"
    ? student.gender
    : null;
}

export function genderLabel(gender: string | null | undefined): string {
  if (gender === "male") return "남";
  if (gender === "female") return "여";
  return "미정";
}

export function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function cloneGroups(groups: GroupEditorDraft[]): GroupEditorDraft[] {
  return groups.map((group) => ({
    ...group,
    studentIds: [...group.studentIds],
  }));
}

export function clampGroupCount(count: number, max: number): number {
  return Math.min(
    Math.max(count, MIN_GROUP_COUNT),
    Math.max(MIN_GROUP_COUNT, max),
  );
}

export function seatingTransitionName(studentId: string) {
  return `seat-${studentId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function pairMatches(
  a: GroupEditorStudent | undefined,
  b: GroupEditorStudent | undefined,
  mode: PairMode,
): boolean {
  if (mode === "any") return true;
  const aGender = genderOf(a);
  const bGender = genderOf(b);
  if (!aGender || !bGender) return false;
  if (mode === "mixed") return aGender !== bGender;
  if (mode === "same") return aGender === bGender;
  if (mode === "male_male") return aGender === "male" && bGender === "male";
  return aGender === "female" && bGender === "female";
}

export function pairModeLabel(mode: PairMode): string {
  switch (mode) {
    case "mixed":
      return "남녀";
    case "same":
      return "동성";
    case "male_male":
      return "남남";
    case "female_female":
      return "여여";
    default:
      return "제한 없음";
  }
}
