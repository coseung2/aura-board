import "server-only";

export type ReadingBookType = "comic" | "story";

export type ReadingEvaluationInput = {
  bookType: ReadingBookType;
  title: string;
  author: string;
  reflection: string;
};

export type ReadingEvaluationResult = {
  score: number;
  feedback: string;
};

const MIN_REFLECTION = 10;
const GOOD_REFLECTION = 80;
const MIN_TITLE_AUTHOR = 1;

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function pickFeedback(score: number, input: ReadingEvaluationInput): string {
  const bookLabel =
    input.bookType === "comic" ? "\ub9cc\ud654\ucc45" : "\uc774\uc57c\uae30\ucc45";
  if (score >= 8) {
    return `${bookLabel} \uae30\ub85d\uc5d0\uc11c \uc778\uc0c1 \uae4a\uc740 \uc7a5\uba74\uacfc \uc790\uae30 \uc0dd\uac01\uc774 \uc798 \ub4dc\ub7ec\ub0ac\uc5b4\uc694.`;
  }
  if (score >= 5) {
    return `${bookLabel} \uae30\ub85d\uc744 \uc798 \uc2dc\uc791\ud588\uc5b4\uc694. \uac00\uc7a5 \uae30\uc5b5\uc5d0 \ub0a8\ub294 \uc7a5\uba74\uc744 \ud55c \uc904 \ub354 \uc801\uc73c\uba74 \uc88b\uc544\uc694.`;
  }
  return `${bookLabel} \uae30\ub85d\uc744 \uc2dc\uc791\ud588\uc5b4\uc694. \ub290\ub080 \uc810\uc744 \ud55c \ubb38\uc7a5\ub9cc \ub354 \ubd99\uc5ec \ubcfc\uae4c\uc694?`;
}

export function evaluateReadingLog(
  input: ReadingEvaluationInput,
): ReadingEvaluationResult {
  const titleOk = input.title.trim().length >= MIN_TITLE_AUTHOR;
  const authorOk = input.author.trim().length >= MIN_TITLE_AUTHOR;
  const reflection = input.reflection.trim();

  if (!titleOk || !authorOk || reflection.length < MIN_REFLECTION) {
    return {
      score: 0,
      feedback:
        "\uc81c\ubaa9, \uc9c0\uc740\uc774, \ub290\ub080 \uc810\uc744 \uc870\uae08 \ub354 \uc790\uc138\ud788 \uc801\uc5b4 \ubcfc\uae4c\uc694?",
    };
  }

  const words = countWords(reflection);
  const lengthScore = Math.min(1, reflection.length / GOOD_REFLECTION);
  const variety = Math.min(0.1, words / 200);
  const raw = lengthScore * 9 + variety * 10;
  const score = Math.max(1, Math.min(10, Math.round(raw)));

  return { score, feedback: pickFeedback(score, input) };
}
