import { SONG_GUESS_ANSWER_WINDOW_MS, SONG_GUESS_HIGHLIGHT_MS } from "./contracts";

/**
 * Teacher setup shows how long a prepared game is likely to take. The answer
 * window is fixed by the authoritative rules, so the estimate only varies with
 * the round count plus the reveal/transition time a teacher spends per round.
 */
export const SONG_GUESS_REVEAL_OVERHEAD_MS = 12000 as const;

export type SongGuessDurationEstimate = {
  minMinutes: number;
  maxMinutes: number;
  label: string;
};

export function estimateSongGuessDuration(
  roundCount: number,
): SongGuessDurationEstimate | null {
  if (!Number.isSafeInteger(roundCount) || roundCount < 1) return null;
  const fastMs = roundCount * (SONG_GUESS_HIGHLIGHT_MS + SONG_GUESS_REVEAL_OVERHEAD_MS);
  const slowMs = roundCount * (SONG_GUESS_ANSWER_WINDOW_MS + SONG_GUESS_REVEAL_OVERHEAD_MS);
  const minMinutes = Math.max(1, Math.round(fastMs / 60000));
  const maxMinutes = Math.max(minMinutes, Math.round(slowMs / 60000));
  return {
    minMinutes,
    maxMinutes,
    label: minMinutes === maxMinutes ? `약 ${minMinutes}분` : `약 ${minMinutes}–${maxMinutes}분`,
  };
}
