import type { GuessFeedback } from "./engine";
import {
  normalizeGamePresence,
  type GamePresenceParticipant,
} from "@/lib/game-platform/presence";

export const KORDLE_GUESS_SUBMITTED_EVENT = "guess-submitted";
export const KORDLE_PUZZLE_CHANGED_EVENT = "puzzle-changed";
export const KORDLE_PARTICIPANTS_CHANGED_EVENT = "participants-changed";

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

export type KordlePresencePayload = GamePresenceParticipant;

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
  return normalizeGamePresence(state);
}
