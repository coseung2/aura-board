// BC-2 Kordle engine — word normalization.
// Korean jamo decomposition lives here so the comparison layer never has to
// care about composition. English lowercasing + apostrophe stripping is the
// only path for en-* locales.

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;

function isHangulSyllable(cp: number): boolean {
  return cp >= HANGUL_BASE && cp <= HANGUL_END;
}

function decomposeSyllable(cp: number): number[] {
  // Hangul syllable = 0xAC00 + (lead * 588) + (medial * 28) + (trail)
  // where lead = 19 choseong, medial = 21 jungseong, trail = 28 (0 = none).
  const offset = cp - HANGUL_BASE;
  const lead = Math.floor(offset / 588);
  const medial = Math.floor((offset % 588) / 28);
  const trail = offset % 28;
  return [lead, medial, trail];
}

export function normalizeKorean(input: string): string {
  // Lowercase ASCII; NFC; strip whitespace.
  const trimmed = input.replace(/\s+/g, "").toLowerCase();
  // NFC first so any decomposed input collapses to a canonical form.
  const nfc = trimmed.normalize("NFC");
  let out = "";
  for (const ch of nfc) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (isHangulSyllable(cp)) {
      // Emit leading + medial + trail as separate code points.
      const [lead, medial, trail] = decomposeSyllable(cp);
      out += String.fromCodePoint(0x1100 + lead);
      out += String.fromCodePoint(0x1161 + medial);
      if (trail > 0) out += String.fromCodePoint(0x11a7 + trail);
    } else if (cp >= 0x1100 && cp <= 0x11ff) {
      // Already a jamo — keep as is.
      out += ch;
    } else {
      out += ch;
    }
  }
  return out;
}

export function normalizeEnglish(input: string): string {
  return input.replace(/[\s'\u2019\-]/g, "").toLowerCase();
}

export function normalizeWord(input: string, locale: string): string {
  if (locale.toLowerCase().startsWith("ko")) {
    return normalizeKorean(input);
  }
  if (locale.toLowerCase().startsWith("en")) {
    return normalizeEnglish(input);
  }
  // Fallback: lowercase + strip whitespace only.
  return input.replace(/\s+/g, "").toLowerCase();
}

// True if every code point is a Hangul composing jamo (lead U+1100..U+1112,
// medial U+1161..U+1175, or trail U+11A8..U+11C2). This is the character
// class we get AFTER `normalizeKorean` runs, so validateGuess should use
// this rather than `isAllHangulSyllables`, which expects precomposed input.
export function isAllHangulJamos(input: string): boolean {
  for (const ch of input) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    const isLead = cp >= 0x1100 && cp <= 0x1112;
    const isMedial = cp >= 0x1161 && cp <= 0x1175;
    const isTrail = cp >= 0x11a8 && cp <= 0x11c2;
    if (!isLead && !isMedial && !isTrail) return false;
  }
  return true;
}

export function isAsciiLetters(input: string): boolean {
  return /^[A-Za-z]+$/.test(input);
}
// Re-compose a jamo-decomposed Hangul string back into syllables for UI
// display. Pure function; safe to call on the client.
export function recomposeHangul(decomposed: string): string {
  const cps: number[] = [];
  for (const ch of decomposed) {
    cps.push(ch.codePointAt(0) ?? 0);
  }
  let out = "";
  let i = 0;
  while (i < cps.length) {
    if (i + 1 < cps.length) {
      const lead = cps[i];
      const medial = cps[i + 1];
      const leadOk = lead >= 0x1100 && lead <= 0x1112;
      const medialOk = medial >= 0x1161 && medial <= 0x1175;
      if (leadOk && medialOk) {
        const leadIdx = lead - 0x1100;
        const medialIdx = medial - 0x1161;
        let trailIdx = 0;
        let consumed = 2;
        if (
          i + 2 < cps.length &&
          cps[i + 2] >= 0x11a8 &&
          cps[i + 2] <= 0x11c2
        ) {
          trailIdx = cps[i + 2] - 0x11a8 + 1;
          consumed = 3;
        }
        out += String.fromCodePoint(0xac00 + leadIdx * 588 + medialIdx * 28 + trailIdx);
        i += consumed;
        continue;
      }
    }
    out += String.fromCodePoint(cps[i]);
    i += 1;
  }
  return out;
}