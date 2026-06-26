// BC-2 Kordle engine — Wordle-style guess evaluation.
// The classic two-pass algorithm:
//   1. Mark "correct" letters (right char, right position) and deduct them
//      from a remaining-counts map.
//   2. Walk again; for each still-unmarked letter, if the solution still has
//      that char in the counts map, mark "present" and deduct; otherwise
//      "absent". This handles duplicate letters correctly (e.g. guessing
//      "APPLE" against "PAPER" yields the standard Wordle result).
//
// Both inputs are expected to be already normalized (jamo-decomposed for
// Korean, lowercased for English) and to share the same code-point length.

import { normalizeWord } from "./normalizeWord";
import type { GuessFeedback, KordleEngineConfig, LetterFeedback, LetterState } from "./types";

export function evaluateGuess(
  solution: string,
  rawGuess: string,
  config: KordleEngineConfig,
): { feedback: GuessFeedback; isCorrect: boolean; normalizedGuess: string } {
  const normalizedSolution = normalizeWord(solution, config.locale);
  const normalizedGuess = normalizeWord(rawGuess, config.locale);

  if (normalizedSolution.length !== config.wordLength) {
    throw new Error(
      `Kordle: solution length ${normalizedSolution.length} does not match wordLength ${config.wordLength}`,
    );
  }
  if (normalizedGuess.length !== config.wordLength) {
    throw new Error(
      `Kordle: guess length ${normalizedGuess.length} does not match wordLength ${config.wordLength}`,
    );
  }

  const states: LetterState[] = new Array(config.wordLength).fill("absent");
  const remaining: Map<number, number> = new Map();

  // Pass 1: correct (right char + right position).
  for (let i = 0; i < config.wordLength; i++) {
    const g = normalizedGuess.codePointAt(i) ?? 0;
    const s = normalizedSolution.codePointAt(i) ?? 0;
    if (g === s) {
      states[i] = "correct";
    } else {
      remaining.set(s, (remaining.get(s) ?? 0) + 1);
    }
  }

  // Pass 2: present (right char, wrong position) / absent.
  for (let i = 0; i < config.wordLength; i++) {
    if (states[i] === "correct") continue;
    const g = normalizedGuess.codePointAt(i) ?? 0;
    const count = remaining.get(g) ?? 0;
    if (count > 0) {
      states[i] = "present";
      remaining.set(g, count - 1);
    } else {
      states[i] = "absent";
    }
  }

  // For Korean, feedback.char carries the decomposed jamo (1-3 code points
  // per syllable). The UI is responsible for composing them back to a
  // syllable for display using `recomposeHangul` from normalizeWord.
  const feedback: GuessFeedback = states.map((state, i) => ({
    char: String.fromCodePoint(normalizedGuess.codePointAt(i) ?? 0),
    state,
  }));

  const isCorrect = states.every((s) => s === "correct");
  return { feedback, isCorrect, normalizedGuess };
}