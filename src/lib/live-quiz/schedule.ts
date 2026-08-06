export const LIVE_QUIZ_TIME_ZONE = "Asia/Seoul";
export const LIVE_QUIZ_START_HOUR = 13;
export const LIVE_QUIZ_START_MINUTE = 30;
export const LIVE_QUIZ_ANSWER_SECONDS = 20;
export const LIVE_QUIZ_REVEAL_SECONDS = 5;
export const LIVE_QUIZ_MAX_QUESTIONS = 10;
export const LIVE_QUIZ_MIN_QUESTIONS = 4;
export const LIVE_QUIZ_LOCK_MINUTES = 5;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type LiveQuizTimeline =
  | {
      phase: "waiting";
      questionIndex: null;
      stage: null;
      roundStartedAt: null;
      stageEndsAt: Date;
    }
  | {
      phase: "live";
      questionIndex: number;
      stage: "answer" | "reveal";
      roundStartedAt: Date;
      stageEndsAt: Date;
    }
  | {
      phase: "finished";
      questionIndex: null;
      stage: null;
      roundStartedAt: null;
      stageEndsAt: Date;
    };

export function kstDayKey(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addKstDays(dayKey: string, amount: number): string {
  const value = Date.parse(`${dayKey}T00:00:00.000Z`);
  if (!Number.isFinite(value)) throw new Error("invalid_kst_day_key");
  return new Date(value + amount * DAY_MS).toISOString().slice(0, 10);
}

export function liveQuizStartsAt(dayKey: string): Date {
  return new Date(
    `${dayKey}T${String(LIVE_QUIZ_START_HOUR).padStart(2, "0")}:${String(
      LIVE_QUIZ_START_MINUTE,
    ).padStart(2, "0")}:00+09:00`,
  );
}

export function liveQuizLockAt(dayKey: string): Date {
  return new Date(
    liveQuizStartsAt(dayKey).getTime() - LIVE_QUIZ_LOCK_MINUTES * 60 * 1000,
  );
}

export function liveQuizRoundDurationMs(): number {
  return (LIVE_QUIZ_ANSWER_SECONDS + LIVE_QUIZ_REVEAL_SECONDS) * 1000;
}

export function liveQuizEndsAt(startsAt: Date, questionCount: number): Date {
  return new Date(
    startsAt.getTime() + Math.max(0, questionCount) * liveQuizRoundDurationMs(),
  );
}

export function liveQuizTimeline(
  now: Date,
  startsAt: Date,
  questionCount: number,
): LiveQuizTimeline {
  const endsAt = liveQuizEndsAt(startsAt, questionCount);
  if (now.getTime() < startsAt.getTime()) {
    return {
      phase: "waiting",
      questionIndex: null,
      stage: null,
      roundStartedAt: null,
      stageEndsAt: startsAt,
    };
  }

  if (now.getTime() >= endsAt.getTime() || questionCount <= 0) {
    return {
      phase: "finished",
      questionIndex: null,
      stage: null,
      roundStartedAt: null,
      stageEndsAt: endsAt,
    };
  }

  const elapsedMs = now.getTime() - startsAt.getTime();
  const roundDurationMs = liveQuizRoundDurationMs();
  const questionIndex = Math.floor(elapsedMs / roundDurationMs);
  const elapsedInRound = elapsedMs % roundDurationMs;
  const roundStartedAt = new Date(
    startsAt.getTime() + questionIndex * roundDurationMs,
  );
  const answerDurationMs = LIVE_QUIZ_ANSWER_SECONDS * 1000;
  const stage = elapsedInRound < answerDurationMs ? "answer" : "reveal";
  const stageEndsAt = new Date(
    roundStartedAt.getTime() +
      (stage === "answer" ? answerDurationMs : roundDurationMs),
  );

  return {
    phase: "live",
    questionIndex,
    stage,
    roundStartedAt,
    stageEndsAt,
  };
}
