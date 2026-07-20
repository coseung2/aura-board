// Pure helpers used by CardAuthorFooter. Lives in lib/ to keep the
// component free of testable logic and let both the tsx-runner legacy
// tests and the new Vitest cases cover them.

import { normalizeDbTimestamp } from "./db-timestamp";

const CARD_DATE_TIME_ZONE = "Asia/Seoul";
const cardDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  calendar: "iso8601",
  numberingSystem: "latn",
  timeZone: CARD_DATE_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function pickAuthorName(
  external?: string | null,
  student?: string | null,
  author?: string | null,
): string | null {
  return external ?? student ?? author ?? null;
}

/**
 * Shape that `formatAuthorList` accepts. Matches the CardAuthor row
 * projection (order + displayName) without forcing a DB import at call
 * sites. Pass `[]` to fall back to the legacy pickAuthorName chain.
 */
export type AuthorLike = {
  order: number;
  displayName: string;
};

/**
 * Card footer display — 0/1/2/3/4+ cases:
 *   0    → pickAuthorName fallback (legacy)
 *   1    → "김철수"
 *   2    → "김철수님과 이영희님"
 *   3+   → "김철수님과 N명"
 *
 * Entries are sorted by .order ascending so callers can pass unsorted
 * Prisma rows without extra work.
 */
export function formatAuthorList(
  authors: AuthorLike[] | null | undefined,
  externalFallback?: string | null,
  studentFallback?: string | null,
  authorFallback?: string | null,
): string | null {
  const list = [...(authors ?? [])]
    .filter((a) => a && a.displayName && a.displayName.trim().length > 0)
    .sort((a, b) => a.order - b.order);
  if (list.length === 0) {
    return pickAuthorName(externalFallback, studentFallback, authorFallback);
  }
  if (list.length === 1) return list[0].displayName;
  if (list.length === 2) {
    return `${withNim(list[0].displayName)}과 ${withNim(list[1].displayName)}`;
  }
  return `${withNim(list[0].displayName)}과 ${list.length - 1}명`;
}

function withNim(name: string): string {
  return name.endsWith("님") ? name : `${name}님`;
}

export function formatRelativeKo(
  iso: string,
  now: number = Date.now(),
): {
  rel: string;
  abs: string;
} {
  const date = new Date(normalizeDbTimestamp(iso));
  const ms = now - date.getTime();
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  let rel: string;
  if (sec < 30) rel = "방금";
  else if (min < 1) rel = `${sec}초 전`;
  else if (hr < 1) rel = `${min}분 전`;
  else if (day < 1) rel = `${hr}시간 전`;
  else if (day < 7) rel = `${day}일 전`;
  else rel = formatCardDate(date);

  const abs = formatCardDateTime(date);
  return { rel, abs };
}

type CardDateTimeParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function getCardDateTimeParts(date: Date): CardDateTimeParts {
  const parts = Object.fromEntries(
    cardDateTimeFormatter
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function formatCardDate(date: Date): string {
  if (Number.isNaN(date.getTime())) return "Invalid Date";
  const { year, month, day } = getCardDateTimeParts(date);
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}

function formatCardDateTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return "Invalid Date";
  const { year, month, day, hour, minute, second } = getCardDateTimeParts(date);
  const hour24 = Number(hour);
  const period = hour24 < 12 ? "오전" : "오후";
  const hour12 = hour24 % 12 || 12;
  return `${year}. ${Number(month)}. ${Number(day)}. ${period} ${hour12}:${minute}:${second}`;
}
