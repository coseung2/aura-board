export const SONG_GUESS_CATALOG_CATEGORIES = [
  "girl-idol",
  "boy-idol",
  "2000s",
  "2010s",
  "2020s",
  "other",
  "classical",
] as const;

export type SongGuessCatalogCategory =
  (typeof SONG_GUESS_CATALOG_CATEGORIES)[number];
export type SongGuessCatalogSegment = "intro" | "highlight";

export const SONG_GUESS_CATALOG_CATEGORY_LABELS: Record<
  SongGuessCatalogCategory,
  string
> = {
  "girl-idol": "여자 아이돌",
  "boy-idol": "남자 아이돌",
  "2000s": "2000년대 명곡",
  "2010s": "2010년대 명곡",
  "2020s": "2020년대 명곡",
  other: "기타",
  classical: "클래식",
};

export type SongGuessCatalogClip =
  | { file: string }
  | { videoId: string; startSeconds: number }
  | {
      objectKey: string;
      mimeType: "audio/wav";
      durationMs: number;
      sizeBytes: number;
      sha256: string;
    };

export type SongGuessCatalogEntry = {
  id: string;
  title: string;
  artist: string;
  aliases: string[];
  categories: SongGuessCatalogCategory[];
  sourceUrl: string;
  sourceMetadata?: Record<string, unknown>;
  clips: Partial<Record<SongGuessCatalogSegment, SongGuessCatalogClip>>;
};

export type SongGuessCatalogSongSummary = {
  id: string;
  title: string;
  artist: string;
  aliases: string[];
  categories: SongGuessCatalogCategory[];
  sourceUrl: string;
  segments: Record<SongGuessCatalogSegment, boolean>;
};

export type SongGuessCatalogSummary = {
  categories: Array<{
    id: SongGuessCatalogCategory;
    label: string;
    counts: Record<SongGuessCatalogSegment, number>;
  }>;
  songs: SongGuessCatalogSongSummary[];
};

export type SongGuessCatalogSelection = {
  categories: SongGuessCatalogCategory[];
  segment: SongGuessCatalogSegment;
  count: number;
};

export function isSongGuessCatalogCategory(
  value: unknown,
): value is SongGuessCatalogCategory {
  return (SONG_GUESS_CATALOG_CATEGORIES as readonly string[]).includes(
    String(value),
  );
}

export function isSongGuessCatalogSegment(
  value: unknown,
): value is SongGuessCatalogSegment {
  return value === "intro" || value === "highlight";
}

export function isSongGuessCatalogClipPlayable(
  value: unknown,
): value is Extract<SongGuessCatalogClip, { file: string }> | Extract<SongGuessCatalogClip, { objectKey: string }> {
  if (!isRecord(value)) return false;
  if (typeof value.file === "string") return Boolean(value.file.trim());
  return (
    typeof value.objectKey === "string" &&
    isSafeSongGuessCatalogObjectKey(value.objectKey) &&
    value.mimeType === "audio/wav" &&
    value.durationMs === 15_000 &&
    typeof value.sizeBytes === "number" &&
    Number.isSafeInteger(value.sizeBytes) &&
    value.sizeBytes > 0 &&
    /^[a-f0-9]{64}$/.test(String(value.sha256))
  );
}

export function isSafeSongGuessCatalogObjectKey(value: string): boolean {
  const parts = value.split("/");
  return (
    parts.length === 5 &&
    parts[0] === "song-guess" &&
    parts[1] === "catalog" &&
    /^[A-Za-z0-9._-]+$/.test(parts[2] ?? "") &&
    parts[2] !== "." &&
    parts[2] !== ".." &&
    (parts[3] === "intro" || parts[3] === "highlight") &&
    /^[a-f0-9]{64}\.wav$/.test(parts[4] ?? "")
  );
}

/** Parse and validate the checked-in manifest without touching the filesystem. */
export function normalizeSongGuessCatalogManifest(
  value: unknown,
): SongGuessCatalogEntry[] {
  let records: unknown[];
  if (Array.isArray(value)) {
    records = value;
  } else if (isRecord(value)) {
    const candidate = Array.isArray(value.songs) ? value.songs : value.entries;
    if (!Array.isArray(candidate))
      throw new Error("invalid_song_guess_catalog_manifest");
    records = candidate;
  } else {
    throw new Error("invalid_song_guess_catalog_manifest");
  }

  const ids = new Set<string>();
  return records.map((raw) => {
    if (!isRecord(raw)) throw new Error("invalid_song_guess_catalog_entry");
    const id = readNonEmptyString(raw.id, 128);
    const title = readNonEmptyString(raw.title, 200);
    const artist = readNonEmptyString(raw.artist, 200);
    if (!/^[A-Za-z0-9._-]+$/.test(id) || id === "." || id === ".." || ids.has(id)) {
      throw new Error("invalid_song_guess_catalog_entry");
    }
    ids.add(id);
    const aliases = readStringArray(raw.aliases, 20, 200);
    const categoryValues = readStringArray(
      raw.categories,
      SONG_GUESS_CATALOG_CATEGORIES.length,
      40,
    );
    if (categoryValues.length === 0) {
      throw new Error("invalid_song_guess_catalog_category");
    }
    const categories = categoryValues.map((category) => {
      if (!isSongGuessCatalogCategory(category)) {
        throw new Error("invalid_song_guess_catalog_category");
      }
      return category;
    });
    if (new Set(categories).size !== categories.length) {
      throw new Error("invalid_song_guess_catalog_category");
    }
    const sourceUrl = readNonEmptyString(raw.sourceUrl, 2_000);
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error();
      }
    } catch {
      throw new Error("invalid_song_guess_catalog_source");
    }
    const clips = normalizeCatalogClips(raw.clips);
    if (!clips.intro && !clips.highlight) {
      throw new Error("invalid_song_guess_catalog_clips");
    }
    return {
      id,
      title,
      artist,
      aliases,
      categories,
      sourceUrl,
      sourceMetadata: isRecord(raw.sourceMetadata) ? raw.sourceMetadata : undefined,
      clips,
    };
  });
}

/**
 * Selects playable songs using union semantics for categories: a song matching
 * any selected category is eligible. The optional random function is injectable
 * so selection tests do not depend on process randomness.
 */
export function selectSongGuessCatalogEntries(
  entries: readonly SongGuessCatalogEntry[],
  selection: SongGuessCatalogSelection,
  random: () => number = Math.random,
): SongGuessCatalogEntry[] {
  if (
    !isSongGuessCatalogSegment(selection.segment) ||
    !Number.isSafeInteger(selection.count) ||
    selection.count < 1 ||
    selection.count > 50
  ) {
    throw new Error("invalid_song_guess_catalog_selection");
  }
  const categories = [...new Set(selection.categories)];
  if (categories.some((category) => !isSongGuessCatalogCategory(category))) {
    throw new Error("invalid_song_guess_catalog_category");
  }
  const categorySet = new Set(categories);
  const candidates = entries.filter(
    (entry) =>
      isSongGuessCatalogClipPlayable(entry.clips[selection.segment]) &&
      (categorySet.size === 0 ||
        entry.categories.some((category) => categorySet.has(category))),
  );
  if (candidates.length < selection.count) {
    throw new Error("song_guess_catalog_insufficient_songs");
  }

  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const value = random();
    const normalized = Number.isFinite(value)
      ? Math.max(0, Math.min(0.999999999, value))
      : 0;
    const swapIndex = Math.floor(normalized * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled.slice(0, selection.count);
}

export function summarizeSongGuessCatalog(
  entries: readonly SongGuessCatalogEntry[],
): SongGuessCatalogSummary {
  const songs = entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    artist: entry.artist,
    aliases: [...entry.aliases],
    categories: [...entry.categories],
    sourceUrl: entry.sourceUrl,
    segments: {
      intro: isSongGuessCatalogClipPlayable(entry.clips.intro),
      highlight: isSongGuessCatalogClipPlayable(entry.clips.highlight),
    },
  }));
  const categories = SONG_GUESS_CATALOG_CATEGORIES.map((id) => ({
    id,
    label: SONG_GUESS_CATALOG_CATEGORY_LABELS[id],
    counts: {
      intro: entries.filter(
        (entry) =>
          entry.categories.includes(id) &&
          isSongGuessCatalogClipPlayable(entry.clips.intro),
      ).length,
      highlight: entries.filter(
        (entry) =>
          entry.categories.includes(id) &&
          isSongGuessCatalogClipPlayable(entry.clips.highlight),
      ).length,
    },
  }));
  return { categories, songs };
}

function normalizeCatalogClips(
  value: unknown,
): Partial<Record<SongGuessCatalogSegment, SongGuessCatalogClip>> {
  if (!isRecord(value)) throw new Error("invalid_song_guess_catalog_clips");
  const clips: Partial<Record<SongGuessCatalogSegment, SongGuessCatalogClip>> =
    {};
  for (const segment of ["intro", "highlight"] as const) {
    const candidate = value[segment];
    if (candidate === undefined) continue;
    if (!isRecord(candidate)) {
      throw new Error("invalid_song_guess_catalog_clips");
    }
    if (typeof candidate.file === "string") {
      if (!candidate.file.trim())
        throw new Error("invalid_song_guess_catalog_clips");
      clips[segment] = { file: candidate.file.trim() };
      continue;
    }
    if (
      typeof candidate.videoId !== "string" ||
      !/^[A-Za-z0-9_-]{11}$/.test(candidate.videoId) ||
      typeof candidate.startSeconds !== "number" ||
      !Number.isFinite(candidate.startSeconds) ||
      candidate.startSeconds < 0
    ) {
      throw new Error("invalid_song_guess_catalog_clips");
    }
    clips[segment] = {
      videoId: candidate.videoId,
      startSeconds: candidate.startSeconds,
    };
  }
  return clips;
}

function readNonEmptyString(value: unknown, maxLength: number): string {
  if (typeof value !== "string")
    throw new Error("invalid_song_guess_catalog_entry");
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength)
    throw new Error("invalid_song_guess_catalog_entry");
  return trimmed;
}

function readStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error("invalid_song_guess_catalog_entry");
  }
  const result = value.map((item) => readNonEmptyString(item, maxLength));
  if (new Set(result).size !== result.length)
    throw new Error("invalid_song_guess_catalog_entry");
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}
