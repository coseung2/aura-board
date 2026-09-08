import type { GroupEditorDraft, GroupEditorStudent } from "./GroupRosterEditor";
import {
  genderOf,
  type FixedPair,
  type PairMode,
} from "./classroom-seating-model";

export type SeatingOptions = {
  students: GroupEditorStudent[];
  groups: GroupEditorDraft[];
  pairMode: PairMode;
  useGenderQuota: boolean;
  femaleTarget: number;
  maleTarget: number;
  fixedPairs: FixedPair[];
  random?: () => number;
};

export type SeatingResult =
  | { ok: true; groups: GroupEditorDraft[]; pairExceptions: number }
  | { ok: false; error: string };

type Gender = 0 | 1 | 2; // female, male, unspecified
type Unit = { genders: Gender[]; fixedType?: number };
const PAIR_TYPES: [Gender, Gender][] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 1],
  [1, 2],
  [2, 2],
];
const gender = (student: GroupEditorStudent): Gender =>
  genderOf(student) === "female" ? 0 : genderOf(student) === "male" ? 1 : 2;

function shuffled<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function matches(a: Gender, b: Gender, mode: PairMode) {
  if (mode === "any") return true;
  if (a === 2 || b === 2) return false;
  if (mode === "mixed") return a !== b;
  if (mode === "same") return a === b;
  return mode === "female_female" ? a === 0 && b === 0 : a === 1 && b === 1;
}

/**
 * Solve all enabled conditions together. A desk pair is [0,1], [2,3], ...
 * within a group, exactly as rendered. Gender inputs are a ratio; odd-sized
 * groups may round either way, but every student's identity is preserved.
 * Search uses gender counts rather than permutations of student identities.
 */
export function arrangeSeating(options: SeatingOptions): SeatingResult {
  const {
    students,
    groups,
    pairMode,
    fixedPairs,
    useGenderQuota,
    femaleTarget,
    maleTarget,
  } = options;
  const random = options.random ?? Math.random;
  const fail = (error: string): SeatingResult => ({ ok: false, error });
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const ids = groups.flatMap((group) => group.studentIds);
  if (ids.length === 0)
    return fail("배치할 학생이 없습니다. 미배정 학생을 교실로 옮겨 주세요.");
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !studentMap.has(id))
  ) {
    return fail(
      "중복되거나 학급에 없는 학생이 있습니다. 배치를 확인해 주세요.",
    );
  }
  if (!groups.length || groups.length > ids.length)
    return fail("모둠 수를 배치할 학생 수 이하로 줄여 주세요.");
  if (
    useGenderQuota &&
    (![femaleTarget, maleTarget].every(
      (v) => Number.isSafeInteger(v) && v >= 0 && v <= 100,
    ) ||
      femaleTarget + maleTarget === 0)
  ) {
    return fail(
      "성비는 0 이상 100 이하의 정수로 입력하고, 한쪽은 1 이상이어야 합니다.",
    );
  }
  const assigned = new Set(ids);
  const members = ids.map((id) => studentMap.get(id)!);
  const totals = [0, 0, 0];
  members.forEach((student) => totals[gender(student)]++);
  if (useGenderQuota && totals[2])
    return fail(
      `성별 미지정 ${totals[2]}명의 성별을 설정하거나 성비 조건을 꺼 주세요.`,
    );
  const sizes = groups.map(
    (_, i) =>
      Math.floor(ids.length / groups.length) +
      (i < ids.length % groups.length ? 1 : 0),
  );
  const ranges = sizes.map((size) => {
    const expected = useGenderQuota
      ? (size * femaleTarget) / (femaleTarget + maleTarget)
      : 0;
    return useGenderQuota
      ? [Math.floor(expected), Math.ceil(expected)]
      : [0, size];
  });
  const totalExpectedFemale =
    (ids.length * femaleTarget) / (femaleTarget + maleTarget);
  if (
    useGenderQuota &&
    (totals[0] < Math.floor(totalExpectedFemale) ||
      totals[0] > Math.ceil(totalExpectedFemale) ||
      totals[0] < ranges.reduce((n, r) => n + r[0], 0) ||
      totals[0] > ranges.reduce((n, r) => n + r[1], 0))
  ) {
    return fail(
      `현재 여 ${totals[0]}명·남 ${totals[1]}명으로 모둠별 ${femaleTarget}:${maleTarget} 성비를 맞출 수 없습니다.`,
    );
  }
  const pairSlots = sizes.reduce((sum, size) => sum + Math.floor(size / 2), 0);

  const fixedIds = new Set<string>();
  const fixedPools: string[][][] = PAIR_TYPES.map(() => []);
  for (const pair of fixedPairs) {
    const [a, b] = pair.studentIds;
    if (!assigned.has(a) || !assigned.has(b))
      return fail(
        "미배정 학생이 포함된 고정짝을 해제하거나 두 학생을 교실로 옮겨 주세요.",
      );
    if (a === b || fixedIds.has(a) || fixedIds.has(b))
      return fail("고정짝에 같은 학생이 중복 지정되어 있습니다.");
    fixedIds.add(a);
    fixedIds.add(b);
    const genders = [
      gender(studentMap.get(a)!),
      gender(studentMap.get(b)!),
    ].sort();
    const type = PAIR_TYPES.findIndex(
      ([x, y]) => x === genders[0] && y === genders[1],
    );
    fixedPools[type].push([a, b]);
  }
  if (fixedPairs.length > pairSlots)
    return fail(
      "고정짝을 함께 앉힐 자리가 부족합니다. 모둠 수를 줄이거나 고정짝을 해제해 주세요.",
    );
  const singlePools: string[][] = [[], [], []];
  members
    .filter((student) => !fixedIds.has(student.id))
    .forEach((student) => singlePools[gender(student)].push(student.id));
  const singles = singlePools.map((pool) => pool.length);
  const fixed = fixedPools.map((pool) => pool.length);
  const slots = sizes.flatMap((size, group) =>
    Array.from({ length: Math.ceil(size / 2) }, (_, row) => ({
      group,
      size: Math.min(2, size - row * 2),
    })),
  );
  const plan: Unit[] = [];
  const memo = new Set<string>();
  let visited = 0;
  let limited = false;

  function solve(
    index: number,
    groupFemale: number,
    groupFilled: number,
    budget: number,
  ): boolean {
    if (index === slots.length) return true;
    if (++visited > 150_000) {
      limited = true;
      return false;
    }
    const { group, size } = slots[index];
    const key = `${index}|${groupFemale}|${singles}|${fixed}|${budget}`;
    if (memo.has(key)) return false;
    const candidates: Unit[] = [];
    if (size === 2) {
      fixed.forEach((count, type) => {
        if (count)
          candidates.push({ genders: PAIR_TYPES[type], fixedType: type });
      });
      for (const [a, b] of PAIR_TYPES) {
        if (
          singles[a] >= (a === b ? 2 : 1) &&
          singles[b] > 0
        )
          candidates.push({ genders: [a, b] });
      }
    } else {
      ([0, 1, 2] as Gender[]).forEach((g) => {
        if (singles[g]) candidates.push({ genders: [g] });
      });
    }
    for (const candidate of shuffled(candidates, random)) {
      const cost = candidate.genders.length === 2 && !matches(candidate.genders[0], candidate.genders[1], pairMode) ? 1 : 0;
      if (cost > budget) continue;
      const nextFemale =
        groupFemale + candidate.genders.filter((g) => g === 0).length;
      const nextFilled = groupFilled + size;
      const remaining = sizes[group] - nextFilled;
      if (
        nextFemale > ranges[group][1] ||
        nextFemale + remaining < ranges[group][0]
      )
        continue;
      if (candidate.fixedType !== undefined) fixed[candidate.fixedType]--;
      else candidate.genders.forEach((g) => singles[g]--);
      plan.push(candidate);
      const endsGroup = remaining === 0;
      if (
        solve(index + 1, endsGroup ? 0 : nextFemale, endsGroup ? 0 : nextFilled, budget - cost)
      )
        return true;
      plan.pop();
      if (candidate.fixedType !== undefined) fixed[candidate.fixedType]++;
      else candidate.genders.forEach((g) => singles[g]++);
      if (limited) return false;
    }
    memo.add(key);
    return false;
  }

  let solved = false;
  let pairExceptions = 0;
  for (; pairExceptions <= pairSlots; pairExceptions++) {
    memo.clear();
    if (solve(0, 0, 0, pairExceptions)) { solved = true; break; }
    if (limited) break;
  }
  if (!solved) {
    return fail(
      limited
        ? "조건 조합이 많아 배치를 완료하지 못했습니다. 조건을 줄이거나 다시 시도해 주세요."
        : "고정짝·짝 조건·성비를 동시에 맞출 수 없습니다. 조건이나 모둠 수를 바꿔 주세요.",
    );
  }
  const result = groups.map((group) => ({
    ...group,
    studentIds: [] as string[],
  }));
  const shuffledSingles = singlePools.map((pool) => shuffled(pool, random));
  const shuffledFixed = fixedPools.map((pool) => shuffled(pool, random));
  plan.forEach((unit, index) => {
    const unitIds =
      unit.fixedType !== undefined
        ? shuffledFixed[unit.fixedType].pop()!
        : unit.genders.map((g) => shuffledSingles[g].pop()!);
    result[slots[index].group].studentIds.push(...shuffled(unitIds, random));
  });
  return { ok: true, groups: result, pairExceptions };
}
