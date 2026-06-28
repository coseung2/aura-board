// BC-2 Kordle engine — shared types. Pure server-safe, no Prisma imports.
// Importable from both client components and server actions; keep deps to
// zero so this layer stays testable and bundle-friendly.

export type LetterState = "correct" | "present" | "absent";

export interface LetterFeedback {
  // Surface character the student entered (after normalization may differ
  // for jamo composition; we store the original so the UI can echo it back).
  char: string;
  state: LetterState;
}

export type GuessFeedback = LetterFeedback[];

export interface KordleEngineConfig {
  wordLength: number;
  maxGuesses: number;
  locale: string;
}

export interface KordleWinnerStats {
  leaderboard: Array<{
    studentId: string;
    name: string;
    wins: number;
  }>;
  rounds: Array<{
    puzzleId: string;
    roundNumber: number;
    winners: Array<{
      studentId: string;
      name: string;
    }>;
    solvedAtGuess: number;
  }>;
}

export interface KordleGuessInput {
  guess: string;
  guessIndex: number; // 1-based
}

export interface KordleGuessResult {
  guess: string;
  normalizedGuess: string;
  isCorrect: boolean;
  feedback: GuessFeedback;
  guessIndex: number;
}

// Server returns this to the client after each successful guess.
export interface KordlePublicState {
  puzzleId: string;
  status: "IN_PROGRESS" | "WON" | "LOST" | "ABANDONED";
  wordLength: number;
  maxGuesses: number;
  // Past guesses (most recent last). Empty for a fresh attempt.
  guesses: GuessFeedback[];
  // Index of the next guess slot (1-based). null if attempt is over.
  nextGuessIndex: number | null;
  // Number of unique letters already revealed as "absent" — used to dim
  // the on-screen keyboard without leaking the solution.
  absentLetters: string[];
  // If WON/LOST, the winning guess index or the last guess respectively.
  solvedAtGuess: number | null;
  turn: {
    currentGuessIndex: number | null;
    nextGuessIndex: number | null;
    submittedCount: number;
    totalCount: number;
    isWaiting: boolean;
    isPendingJoin: boolean;
  };
  winnerStats: KordleWinnerStats;
}
