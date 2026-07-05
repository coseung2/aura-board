// src/lib/speed-game/score.ts
//
// 스피드게임의 키워드/답 정규화 + 점수 계산 + 리더보드 집계를 한 곳에 모은다.
// brief 기준:
//   - normalize-space: 모든 공백 제거 + lowercase
//   - exact compare: trim된 문자열을 그대로 비교
//   - 보너스: 1등 300 / 2등 200 / 3등 100 (rank 1-indexed)
//   - 점수 = max(minScore, baseScore - floor(elapsedMs/20)) + bonus
//   - teacher-approval 모드의 잘못된 답은 correct=false, score=0
//
// 점수 공식은 MVP 기준 단순화함. 보너스는 같은 라운드에서 정답 맞춘 모둠들
// 사이의 시간 순위로 결정된다 (rank = 정답 맞춘 순서).

export function normalizeKeyword(raw: string): string {
  // 모든 공백(일반 + zero-width) 제거 + lowercase.
  return raw
    .replace(/[\s\u00A0\u200B-\u200D\u2060]+/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeAnswer(raw: string): string {
  // 답도 동일한 정규화 (공백 제거 + lowercase + trim).
  return normalizeKeyword(raw);
}

export function answersMatch(
  keywordNormalized: string,
  answer: string,
): boolean {
  return normalizeAnswer(answer) === keywordNormalized;
}

export function parseKeywords(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed.length < 1 || trimmed.length > 80) continue;
    const norm = normalizeKeyword(trimmed);
    if (!norm) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(trimmed);
  }
  return out;
}

export function parseBonusRanks(input: string | null | undefined): number[] {
  // 기본값 300/200/100. 잘못된 값이면 기본값으로 폴백.
  if (!input) return [300, 200, 100];
  const parts = input.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 3) return [300, 200, 100];
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) {
    return [300, 200, 100];
  }
  return parts.map((n) => Math.floor(n));
}

export type SpeedGameScoreInput = {
  correct: boolean;
  elapsedMs: number;
  // 라운드에서 이 답까지 정답을 맞힌 모둠 수(이 답 포함). 0이면 1등이 아니라는 뜻.
  // 실제 호출 시점에는 "이 시점까지 accepted된 다른 모둠 수 + 1"로 계산.
  rank: number;
  bonusRanks: number[];
  baseScore?: number; // default 1000
  minScore?: number; // default 0
  elapsedStepMs?: number; // default 20
};

export function computeScore(input: SpeedGameScoreInput): number {
  if (!input.correct) return 0;
  const baseScore = input.baseScore ?? 1000;
  const minScore = input.minScore ?? 0;
  const step = input.elapsedStepMs ?? 20;
  const bonus = input.bonusRanks[input.rank - 1] ?? 0;
  const elapsedPenalty = Math.floor(Math.max(0, input.elapsedMs) / step);
  const raw = baseScore - elapsedPenalty + bonus;
  return Math.max(minScore, raw);
}

// accepted 시간 순으로 rank(1..N) 를 매긴다. createdAt 이 같으면 answerId asc.
// ScoreGuess 는 (answerId, createdAt, correct) 만 본다 — 모든 라운드 답.
export type ScoreGuess = {
  answerId: string;
  correct: boolean;
  createdAt: Date;
};

export function rankCorrectAnswers(
  guesses: ScoreGuess[],
): Map<string, { rank: number; elapsedMs: number }> {
  // 정답만 시간 오름차순으로 정렬 후 rank 부여.
  const sorted = [...guesses]
    .filter((g) => g.correct)
    .sort((a, b) => {
      const t = a.createdAt.getTime() - b.createdAt.getTime();
      if (t !== 0) return t;
      return a.answerId < b.answerId ? -1 : a.answerId > b.answerId ? 1 : 0;
    });
  const out = new Map<string, { rank: number; elapsedMs: number }>();
  let rank = 0;
  let prevTime: number | null = null;
  for (const g of sorted) {
    rank += 1;
    // 동일 시각이면 같은 rank 로 묶지 않고 1씩 증가 (MVP 단순화).
    prevTime = g.createdAt.getTime();
    out.set(g.answerId, { rank, elapsedMs: 0 });
  }
  // elapsedMs 는 라운드 시작 시각을 안다면 호출자가 따로 채워준다.
  // 이 함수에서는 rank 만 보장.
  return out;
}

// 리더보드 집계: 같은 보드의 모든 accepted correct 답을 모둠별로 합산.
// 정답/오답 카운트 + 점수 합계. 정렬: score desc, correctCount desc,
// firstCorrectAt asc (가장 먼저 맞힌 모둠 우선).
export type AnswerForLeaderboard = {
  answerId: string;
  groupId: string;
  studentId: string;
  correct: boolean;
  score: number;
  createdAt: Date;
};

export type LeaderboardEntry = {
  groupId: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  firstCorrectAt: Date | null;
};

export function buildLeaderboard(answers: AnswerForLeaderboard[]): LeaderboardEntry[] {
  const byGroup = new Map<string, LeaderboardEntry>();
  for (const a of answers) {
    const prev =
      byGroup.get(a.groupId) ?? {
        groupId: a.groupId,
        score: 0,
        correctCount: 0,
        wrongCount: 0,
        firstCorrectAt: null,
      };
    prev.score += a.score;
    if (a.correct) {
      prev.correctCount += 1;
      if (!prev.firstCorrectAt || a.createdAt < prev.firstCorrectAt) {
        prev.firstCorrectAt = a.createdAt;
      }
    } else {
      prev.wrongCount += 1;
    }
    byGroup.set(a.groupId, prev);
  }
  return Array.from(byGroup.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    const at = a.firstCorrectAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bt = b.firstCorrectAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return at - bt;
  });
}

// guesserSlot 자동 회전: order(0-indexed) -> 1..4. 명시적 override 가능.
export function deriveGuesserSlot(order: number): number {
  return (order % 4) + 1;
}

// join 1..100 키워드 → 콤마 join (저장용).
export function serializeKeywords(keywords: string[]): string {
  return keywords.join(",");
}

// 콤마 join → string[] (trim + 빈 값 제거만; 중복/길이 검증은 parseKeywords).
export function deserializeKeywords(raw: string): string[] {
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}