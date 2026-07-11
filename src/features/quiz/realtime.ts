export const QUIZ_SNAPSHOT_EVENT = "quiz_snapshot";

export type QuizRealtimePlayer = {
  id: string;
  nickname: string;
  score: number;
};

export type QuizRealtimeQuestion = {
  id: string;
  index: number;
  total: number;
  text: string;
  options: [string, string, string, string];
  timeLimit: number;
};

export type QuizRealtimeSnapshot = {
  version: 1;
  quizId: string;
  status: "waiting" | "active" | "finished";
  currentQuestionIndex: number;
  totalQuestions: number;
  currentQuestion: QuizRealtimeQuestion | null;
  players: QuizRealtimePlayer[];
  distribution: Record<"A" | "B" | "C" | "D", number>;
  totalAnswers: number;
  updatedAt: string;
};

export type QuizPresencePayload = {
  version: 1;
  actorKey: string;
  visible: boolean;
  joinedAt: string;
  updatedAt: string;
};

export function quizChannelKey(quizId: string): string {
  return `quiz:${quizId}`;
}

export function parseQuizRealtimeSnapshot(
  value: unknown,
): QuizRealtimeSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !isShortString(row.quizId)) return null;
  if (
    row.status !== "waiting" &&
    row.status !== "active" &&
    row.status !== "finished"
  ) {
    return null;
  }
  if (
    !Number.isInteger(row.currentQuestionIndex) ||
    !Number.isInteger(row.totalQuestions) ||
    !Array.isArray(row.players) ||
    !isDistribution(row.distribution) ||
    !Number.isInteger(row.totalAnswers) ||
    !isShortString(row.updatedAt)
  ) {
    return null;
  }

  const players: QuizRealtimePlayer[] = [];
  for (const candidate of row.players) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return null;
    }
    const player = candidate as Record<string, unknown>;
    if (
      !isShortString(player.id) ||
      !isShortString(player.nickname) ||
      typeof player.score !== "number" ||
      !Number.isFinite(player.score)
    ) {
      return null;
    }
    players.push({
      id: player.id,
      nickname: player.nickname,
      score: player.score,
    });
  }

  const currentQuestion = parseQuestion(row.currentQuestion);
  if (row.currentQuestion !== null && !currentQuestion) return null;

  return {
    version: 1,
    quizId: row.quizId,
    status: row.status,
    currentQuestionIndex: row.currentQuestionIndex as number,
    totalQuestions: row.totalQuestions as number,
    currentQuestion,
    players,
    distribution: row.distribution,
    totalAnswers: row.totalAnswers as number,
    updatedAt: row.updatedAt,
  };
}

export function buildQuizPresencePayload(input: {
  actorKey: string;
  visible: boolean;
  joinedAt: string;
  now?: string;
}): QuizPresencePayload {
  return {
    version: 1,
    actorKey: input.actorKey,
    visible: input.visible,
    joinedAt: input.joinedAt,
    updatedAt: input.now ?? new Date().toISOString(),
  };
}

/**
 * Presence is a public, ephemeral participant signal. It deliberately carries
 * no player id, student id, nickname, score, answer, or application identity.
 */
export function countQuizPresence(state: Record<string, unknown>): number {
  const actors = new Set<string>();
  for (const value of Object.values(state)) {
    if (!Array.isArray(value)) continue;
    for (const candidate of value) {
      const presence = parseQuizPresence(candidate);
      if (presence?.visible) actors.add(presence.actorKey);
    }
  }
  return actors.size;
}

export function quizPresenceActorStorageKey(
  quizId: string,
  playerId: string,
): string {
  return `aura.quiz.presence.${hashScope(quizId)}.${hashScope(playerId)}`;
}

function parseQuestion(value: unknown): QuizRealtimeQuestion | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    !isShortString(row.id) ||
    !Number.isInteger(row.index) ||
    !Number.isInteger(row.total) ||
    !isShortString(row.text) ||
    !Array.isArray(row.options) ||
    row.options.length !== 4 ||
    !row.options.every(isShortString) ||
    !Number.isInteger(row.timeLimit)
  ) {
    return null;
  }
  return {
    id: row.id,
    index: row.index as number,
    total: row.total as number,
    text: row.text,
    options: row.options as [string, string, string, string],
    timeLimit: row.timeLimit as number,
  };
}

function isDistribution(
  value: unknown,
): value is Record<"A" | "B" | "C" | "D", number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ["A", "B", "C", "D"].every(
    (key) => typeof row[key] === "number" && Number.isFinite(row[key]),
  );
}

function parseQuizPresence(value: unknown): QuizPresencePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.version !== 1 ||
    !isShortString(row.actorKey) ||
    typeof row.visible !== "boolean" ||
    !isShortString(row.joinedAt) ||
    !isShortString(row.updatedAt)
  ) {
    return null;
  }
  return {
    version: 1,
    actorKey: row.actorKey,
    visible: row.visible,
    joinedAt: row.joinedAt,
    updatedAt: row.updatedAt,
  };
}

function isShortString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 500;
}

function hashScope(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
