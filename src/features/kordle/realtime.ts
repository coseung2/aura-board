import type { GuessFeedback } from "./engine";

export const KORDLE_GUESS_SUBMITTED_EVENT = "guess-submitted";
export const KORDLE_PUZZLE_CHANGED_EVENT = "puzzle-changed";

export type KordleLiveEvent = {
  id: string;
  name: string;
  guessIndex: number;
  correctCount: number;
  isCorrect: boolean;
  createdAt: string;
};

export type KordlePuzzleStatus = "DRAFT" | "LIVE" | "CLOSED" | "SCHEDULED" | "ARCHIVED";

export type KordlePuzzleChangedEvent = {
  puzzleId: string;
  status: KordlePuzzleStatus;
  updatedAt: string;
  currentGuessIndex?: number | null;
};

export type KordlePresencePayload = {
  studentId: string;
  name: string;
  joinedAt: string;
};

export function kordleBoardChannelKey(boardId: string): string {
  return `kordle:board:${boardId}`;
}

export function kordleCorrectCount(feedback: unknown): number {
  if (!Array.isArray(feedback)) return 0;
  return (feedback as GuessFeedback).filter((item) => item?.state === "correct").length;
}

export function kordleParticipantsFromPresenceState(
  state: Record<string, KordlePresencePayload[]>,
): KordlePresencePayload[] {
  const byStudent = new Map<string, KordlePresencePayload>();

  for (const payloads of Object.values(state)) {
    for (const payload of payloads) {
      if (!payload?.studentId || !payload.name || !payload.joinedAt) continue;
      const current = byStudent.get(payload.studentId);
      if (!current || payload.joinedAt < current.joinedAt) {
        byStudent.set(payload.studentId, payload);
      }
    }
  }

  return [...byStudent.values()].sort((a, b) => {
    const joinedCompare = a.joinedAt.localeCompare(b.joinedAt);
    return joinedCompare || a.name.localeCompare(b.name);
  });
}
