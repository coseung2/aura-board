import "server-only";

import { db } from "@/lib/db";
import { generateFeedback } from "@/lib/ai-feedback/generate";
import { getTeacherKeyForBoard } from "@/lib/llm/teacher-key";
import {
  isAllHangulJamos,
  isAsciiLetters,
  normalizeWord,
} from "../engine";

export type KordleLocale = "en-US" | "ko-KR";

export const KORDLE_WORD_LENGTH = 6;

const MIN_CACHED_WORDS = 1_000;
const GENERATED_WORD_COUNT = 200;
const COMMON_WORD_UNIT_TAG = "kordle:auto:common";

const BLOCKED_WORDS: Record<KordleLocale, string[]> = {
  "en-US": [
    "bitch",
    "boobs",
    "cocks",
    "dicks",
    "fucks",
    "hitler",
    "nudes",
    "penis",
    "porno",
    "pussy",
    "shits",
    "sluts",
    "whore",
  ],
  "ko-KR": [
    "개새",
    "꺼져",
    "닥쳐",
    "병신",
    "섹스",
    "시발",
    "씨발",
    "자살",
    "죽어",
  ],
};

export const KORDLE_FALLBACK_WORDS: Record<KordleLocale, string[]> = {
  "en-US": [
    "planet",
    "school",
    "friend",
    "garden",
    "window",
    "silver",
    "camera",
    "orange",
    "pencil",
    "rocket",
    "bridge",
    "castle",
    "forest",
    "cookie",
    "summer",
    "winter",
    "circle",
    "market",
    "animal",
    "flower",
    "basket",
    "button",
    "museum",
    "puzzle",
  ],
  "ko-KR": [
    "바나나",
    "토마토",
    "고구마",
    "소나무",
    "피아노",
    "카메라",
    "라디오",
    "도토리",
    "오디오",
    "비디오",
    "아기새",
    "오리배",
    "나비야",
    "무지개",
    "코끼리",
    "기러기",
    "바가지",
    "소라게",
    "오로라",
    "마니아",
  ],
};

type KordleWordCandidate = {
  text: string;
  normalized: string;
};

function cleanCandidate(candidate: string, locale: KordleLocale): string {
  const trimmed = candidate.trim().normalize("NFC");
  if (locale === "en-US") {
    return trimmed.replace(/[^A-Za-z'\-\s]/g, "").toLowerCase();
  }
  return trimmed.replace(/[^\u1100-\u11FF\uAC00-\uD7A3]/g, "");
}

function isBlockedWord(text: string, locale: KordleLocale): boolean {
  const normalizedText = text.toLowerCase();
  return BLOCKED_WORDS[locale].some((blocked) => normalizedText.includes(blocked));
}

export function uniqueValidKordleWords(
  candidates: string[],
  locale: KordleLocale,
  wordLength = KORDLE_WORD_LENGTH,
): KordleWordCandidate[] {
  const seen = new Set<string>();
  const words: KordleWordCandidate[] = [];

  for (const candidate of candidates) {
    const text = cleanCandidate(candidate, locale);
    if (!text) continue;
    if (isBlockedWord(text, locale)) continue;
    const normalized = normalizeWord(text, locale);
    if (normalized.length !== wordLength) continue;
    if (locale === "en-US" && !isAsciiLetters(normalized)) continue;
    if (locale === "ko-KR" && !isAllHangulJamos(normalized)) continue;
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    words.push({ text, normalized });
  }

  return words;
}

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function extractWords(text: string): string[] {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("[");
  const jsonEnd = trimmed.lastIndexOf("]");

  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    const json = trimmed.slice(jsonStart, jsonEnd + 1);
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      // fall through to loose parsing
    }
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { words?: unknown }).words)
    ) {
      return (parsed as { words: unknown[] }).words.filter(
        (item): item is string => typeof item === "string",
      );
    }
  } catch {
    // fall through to loose parsing
  }

  return trimmed
    .split(/[\n,，、]+/)
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);
}

async function generateWordsWithLlm(
  boardId: string,
  locale: KordleLocale,
  wordLength: number,
): Promise<KordleWordCandidate[]> {
  const key = await getTeacherKeyForBoard(boardId);
  if (!key) return [];

  const languageRule =
    locale === "en-US"
      ? [
          "Generate common real English answer words.",
          "Every word must be exactly 6 letters after removing spaces, hyphens, and apostrophes.",
          "Use lowercase only. No proper nouns, slang, abbreviations, or offensive words.",
        ].join(" ")
      : [
          "Generate common real Korean nouns suitable for elementary school students.",
          "Every word must become exactly 6 Hangul jamo after Korean syllable decomposition.",
          "This usually means three Hangul syllables with no final consonant, like 바나나.",
          "No proper nouns, slang, foreign brand names, or offensive words.",
        ].join(" ");

  const result = await generateFeedback({
    provider: key.provider,
    apiKey: key.apiKey,
    baseUrl: key.baseUrl,
    modelId: key.modelId,
    systemPrompt:
      "You generate safe Kordle puzzle answer words. Return JSON only. Do not include explanations.",
    userPrompt: [
      languageRule,
      `Return ${GENERATED_WORD_COUNT} distinct words for locale ${locale}.`,
      `The normalized Kordle length must be ${wordLength}.`,
      'Return exactly this JSON shape: ["word1","word2"].',
    ].join("\n"),
  });

  if (!result.ok) return [];
  return uniqueValidKordleWords(extractWords(result.text), locale, wordLength);
}

async function cacheGeneratedWords(
  boardId: string,
  locale: KordleLocale,
  wordLength: number,
): Promise<number> {
  const generated = await generateWordsWithLlm(boardId, locale, wordLength);
  if (generated.length === 0) return 0;

  await Promise.all(
    generated.map((word) =>
      db.kordleWord.upsert({
        where: {
          locale_normalized: {
            locale,
            normalized: word.normalized,
          },
        },
        update: {
          text: word.text,
          length: wordLength,
          isAllowed: true,
          isSolution: true,
          unitTag: "kordle:auto:llm",
        },
        create: {
          text: word.text,
          normalized: word.normalized,
          length: wordLength,
          locale,
          isAllowed: true,
          isSolution: true,
          unitTag: "kordle:auto:llm",
        },
      }),
    ),
  );

  return generated.length;
}

async function loadCachedWords(
  locale: KordleLocale,
  wordLength: number,
  take: number,
  excludeNormalized: Set<string>,
  unitTag?: string,
): Promise<KordleWordCandidate[]> {
  const rows = await db.kordleWord.findMany({
    where: {
      locale,
      length: wordLength,
      isSolution: true,
      ...(unitTag ? { unitTag } : {}),
      ...(excludeNormalized.size > 0
        ? { normalized: { notIn: Array.from(excludeNormalized) } }
        : {}),
    },
    orderBy: { text: "asc" },
    take,
    select: {
      text: true,
      normalized: true,
    },
  });

  return rows;
}

async function pickCachedWord(
  locale: KordleLocale,
  wordLength: number,
  excludeNormalized: Set<string>,
  unitTag?: string,
): Promise<KordleWordCandidate | null> {
  const count = await db.kordleWord.count({
    where: {
      locale,
      length: wordLength,
      isSolution: true,
      ...(unitTag ? { unitTag } : {}),
      ...(excludeNormalized.size > 0
        ? { normalized: { notIn: Array.from(excludeNormalized) } }
        : {}),
    },
  });
  if (count === 0) return null;

  const [word] = await db.kordleWord.findMany({
    where: {
      locale,
      length: wordLength,
      isSolution: true,
      ...(unitTag ? { unitTag } : {}),
      ...(excludeNormalized.size > 0
        ? { normalized: { notIn: Array.from(excludeNormalized) } }
        : {}),
    },
    skip: Math.floor(Math.random() * count),
    take: 1,
    select: {
      text: true,
      normalized: true,
    },
  });

  return word ?? null;
}

async function loadRecentPuzzleWords(
  boardId: string,
  locale: KordleLocale,
  wordLength: number,
): Promise<Set<string>> {
  const recent = await db.kordlePuzzle.findMany({
    where: {
      game: {
        boardId,
        locale,
      },
      solutionWord: {
        locale,
        length: wordLength,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: {
      solutionWord: {
        select: {
          normalized: true,
        },
      },
    },
  });

  return new Set(recent.map((puzzle) => puzzle.solutionWord.normalized));
}

export async function resolveRandomKordleSolution({
  boardId,
  locale,
  wordLength = KORDLE_WORD_LENGTH,
}: {
  boardId: string;
  locale: KordleLocale;
  wordLength?: number;
}): Promise<KordleWordCandidate> {
  const recentWords = await loadRecentPuzzleWords(boardId, locale, wordLength);
  const commonCount = await db.kordleWord.count({
    where: {
      locale,
      length: wordLength,
      isSolution: true,
      unitTag: COMMON_WORD_UNIT_TAG,
      ...(recentWords.size > 0
        ? { normalized: { notIn: Array.from(recentWords) } }
        : {}),
    },
  });
  if (commonCount >= MIN_CACHED_WORDS) {
    const common = await pickCachedWord(
      locale,
      wordLength,
      recentWords,
      COMMON_WORD_UNIT_TAG,
    );
    if (common) return common;
  }

  const initialCount = await db.kordleWord.count({
    where: {
      locale,
      length: wordLength,
      isSolution: true,
    },
  });

  if (initialCount < MIN_CACHED_WORDS) {
    await cacheGeneratedWords(boardId, locale, wordLength);
  }

  const currentCount = await db.kordleWord.count({
    where: {
      locale,
      length: wordLength,
      isSolution: true,
      ...(recentWords.size > 0
        ? { normalized: { notIn: Array.from(recentWords) } }
        : {}),
    },
  });

  if (currentCount >= MIN_CACHED_WORDS) {
    const cached = await pickCachedWord(locale, wordLength, recentWords);
    if (cached) return cached;
  }

  const cachedWords = await loadCachedWords(
    locale,
    wordLength,
    MIN_CACHED_WORDS,
    recentWords,
  );
  const fallbackWords = uniqueValidKordleWords(
    KORDLE_FALLBACK_WORDS[locale],
    locale,
    wordLength,
  ).filter((word) => !recentWords.has(word.normalized));
  const merged = uniqueValidKordleWords(
    [...cachedWords.map((word) => word.text), ...fallbackWords.map((word) => word.text)],
    locale,
    wordLength,
  );

  if (merged.length > 0) return randomItem(merged);

  const fallbackWithoutRecentFilter = uniqueValidKordleWords(
    KORDLE_FALLBACK_WORDS[locale],
    locale,
    wordLength,
  );
  if (fallbackWithoutRecentFilter.length > 0) {
    return randomItem(fallbackWithoutRecentFilter);
  }

  throw new Error(`No valid Kordle words for ${locale}/${wordLength}`);
}
