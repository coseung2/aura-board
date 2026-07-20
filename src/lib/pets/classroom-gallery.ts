import type { SlimeColor } from "./types";

export type ClassroomSlimeStudent = {
  id: string;
  number: number | null;
  name: string;
  representative: {
    color: SlimeColor;
    equippedItemKeys: string[];
  } | null;
};

export function sortClassroomSlimeStudents<T extends Pick<ClassroomSlimeStudent, "number" | "name">>(
  students: T[],
): T[] {
  return [...students].sort((a, b) => {
    if (a.number === null && b.number !== null) return 1;
    if (a.number !== null && b.number === null) return -1;
    if (a.number !== null && b.number !== null && a.number !== b.number) {
      return a.number - b.number;
    }
    return a.name.localeCompare(b.name, "ko-KR");
  });
}
