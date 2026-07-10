/**
 * 주제별 보드 정렬 (2026-07-08) — 출석번호 시드 모달과 보드설정 > 주제 정렬 탭이
 * 공유하는 정렬 방향 정규화/매핑 헬퍼.
 *
 * 저장값 규칙: "asc" (1번부터 왼쪽) | "desc" (N번부터 왼쪽). null/빈값/이상값은 "asc"로 fallback.
 *
 * 정렬 방향에 따른 unpinned 섹션의 order 베이스 인덱스 계산:
 *   - asc  → 학생 번호 1번이 보드 왼쪽. order는 큰 값이 왼쪽
 *            (sortSections가 order DESC로 정렬). base = (N - 1 - i)
 *   - desc → N번이 보드 왼쪽. base = i
 */
export type SubjectOrder = "asc" | "desc";

const DEFAULT_ORDER: SubjectOrder = "asc";

export function isSubjectOrder(value: unknown): value is SubjectOrder {
  return value === "asc" || value === "desc";
}

export function normalizeSubjectOrder(value: unknown): SubjectOrder {
  return isSubjectOrder(value) ? value : DEFAULT_ORDER;
}

/**
 * 정렬 방향에 따라 unpinned 섹션의 order 베이스 인덱스를 반환한다.
 */
export function subjectOrderToBaseIndex(
  order: SubjectOrder,
  studentIndex: number,
  totalStudents: number,
): number {
  if (totalStudents <= 0) return 0;
  return order === "asc" ? totalStudents - 1 - studentIndex : studentIndex;
}

/**
 * 기존 unpinned 섹션보다 뒤에 학생 섹션 묶음을 붙일 order를 계산한다.
 *
 * unpinned 섹션은 order DESC로 보이므로 새 묶음의 가장 큰 값도 기존 최솟값보다
 * 작아야 한다. 기존 섹션이 없으면 -1부터 시작해 이후 일반 섹션(order >= 0)이
 * 현재 UX대로 학생 묶음 앞에 추가될 수 있게 한다.
 */
export function subjectOrderToAppendOrder(
  order: SubjectOrder,
  studentIndex: number,
  totalStudents: number,
  minimumExistingOrder: number | null,
): number {
  if (totalStudents <= 0) return minimumExistingOrder ?? 0;

  const groupBottom = (minimumExistingOrder ?? 0) - totalStudents;
  return (
    groupBottom +
    subjectOrderToBaseIndex(order, studentIndex, totalStudents)
  );
}

export function subjectOrderLabel(order: SubjectOrder): {
  short: string;
  long: string;
} {
  return order === "asc"
    ? { short: "1번부터", long: "1번부터 보드 왼쪽으로" }
    : { short: "끝번호부터", long: "끝번호부터 보드 왼쪽으로" };
}
