export type SongGuessImportLink = {
  videoId: string;
  startSeconds: number;
  sourceUrl: string;
};

const invalid = (): never => { throw new Error("invalid_song_guess_import_link"); };

/** Accept explicit timed YouTube links; discard tracking/playlist parameters. */
export function parseSongGuessImportLink(input: string): SongGuessImportLink {
  if (typeof input !== "string" || input.length > 4096) return invalid();
  const raw = input.trim();
  // Check authority before URL normalizes default ports, escapes and backslashes.
  const shape = /^https:\/\/(youtube\.com|www\.youtube\.com|m\.youtube\.com|youtu\.be)(\/[^?#]*)(?:\?[^#]*)?(?:#.*)?$/i.exec(raw);
  if (!shape || /[\s\\\u0000-\u001f\u007f]/.test(raw) || /%(?![\da-f]{2})/i.test(raw)) return invalid();
  let url: URL;
  try { url = new URL(raw); } catch { return invalid(); }
  const short = url.hostname === "youtu.be";
  if (!short && shape[2] !== "/watch") return invalid();
  if (short && !/^\/[A-Za-z0-9_-]{11}$/.test(shape[2])) return invalid();
  const ids = url.searchParams.getAll("v");
  if (short ? ids.length !== 0 : ids.length !== 1) return invalid();
  const videoId = short ? shape[2].slice(1) : ids[0];
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return invalid();

  const times = [...url.searchParams.getAll("t"), ...url.searchParams.getAll("start")];
  if (url.hash) {
    // A fragment has exactly one supported field. No ignored/ambiguous times.
    const fragment = new URLSearchParams(url.hash.slice(1));
    if ([...fragment.keys()].length !== 1 || !fragment.has("t")) return invalid();
    times.push(...fragment.getAll("t"));
  }
  if (times.length !== 1) return invalid();
  const time = times[0];
  const units = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(time);
  const startSeconds = /^\d+$/.test(time) ? Number(time)
    : time && units ? Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0)
      : NaN;
  if (!Number.isSafeInteger(startSeconds) || startSeconds < 0 || startSeconds > 86400) return invalid();
  return { videoId, startSeconds, sourceUrl: `https://www.youtube.com/watch?v=${videoId}&t=${startSeconds}` };
}
