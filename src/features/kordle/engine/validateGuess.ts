// BC-2 Kordle engine - guess validation rules.
// Server-side guard. The API route calls this BEFORE evaluating. Returns a
// discriminated result so the route can surface a clear error to the client
// without leaking the dictionary.

import { normalizeWord, isAllHangulJamos, isAsciiLetters } from "./normalizeWord";
import type { KordleEngineConfig } from "./types";

export type ValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: "wrong_length" | "bad_chars" | "not_in_dictionary" | "puzzle_closed" };

export interface DictionaryLookup {
  // Returns true if `normalized` is a valid guess (i.e. isAllowed OR
  // isSolution). Kept as a function so callers can plug in the DB or a
  // hot-loaded word list later.
  isAllowed(normalized: string, locale: string): Promise<boolean>;
}

export async function validateGuess(
  rawGuess: string,
  config: KordleEngineConfig,
  dictionary: DictionaryLookup,
): Promise<ValidationResult> {
  const normalized = normalizeWord(rawGuess, config.locale);
  if (normalized.length !== config.wordLength) {
    return { ok: false, reason: "wrong_length" };
  }
  // After normalizeKorean, the input is a stream of jamo code points, NOT
  // precomposed syllables. So for Korean we use the jamo-set check.
  // For English we keep the ASCII-letter check on the lowercase normalized
  // form.
  if (config.locale.toLowerCase().startsWith("ko")) {
    if (!isAllHangulJamos(normalized)) {
      return { ok: false, reason: "bad_chars" };
    }
  } else if (config.locale.toLowerCase().startsWith("en")) {
    if (!isAsciiLetters(normalized)) {
      return { ok: false, reason: "bad_chars" };
    }
  }
  const allowed = await dictionary.isAllowed(normalized, config.locale);
  if (!allowed) {
    return { ok: false, reason: "not_in_dictionary" };
  }
  return { ok: true, normalized };
}
