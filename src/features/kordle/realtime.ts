import type { GuessFeedback } from "./engine";

export const KORDLE_GUESS_SUBMITTED_EVENT = "guess-submitted";

export type KordleLiveEvent = {
  id: string;
  name: string;
  guessIndex: number;
  correctCount: number;
  isCorrect: boolean;
  createdAt: string;
};

export function kordleBoardChannelKey(boardId: string): string {
  return `kordle:board:${boardId}`;
}

export function kordleCorrectCount(feedback: unknown): number {
  if (!Array.isArray(feedback)) return 0;
  return (feedback as GuessFeedback).filter((item) => item?.state === "correct").length;
}
