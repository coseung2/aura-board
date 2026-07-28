export const STUDENT_BOARD_CATEGORIES = [
  "priority",
  "lesson",
  "play",
  "all",
] as const;

export type StudentBoardCategory = (typeof STUDENT_BOARD_CATEGORIES)[number];

export type StudentBoardSearchParams = Record<
  string,
  string | string[] | undefined
>;

export function parseStudentBoardCategory(
  value: string | null | undefined,
): StudentBoardCategory {
  return STUDENT_BOARD_CATEGORIES.includes(value as StudentBoardCategory)
    ? (value as StudentBoardCategory)
    : "priority";
}

export function legacyStudentBoardRedirect(
  params: StudentBoardSearchParams,
): string | null {
  const legacyBoard = Array.isArray(params.board) ? params.board[0] : params.board;
  if (legacyBoard !== "lesson" && legacyBoard !== "play") return null;

  const next = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    if (key === "board" || rawValue === undefined) continue;
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      next.append(key, value);
    }
  }
  next.set("category", legacyBoard);
  return `/student/boards?${next.toString()}`;
}
