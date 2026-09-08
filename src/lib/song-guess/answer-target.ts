import { normalizeSongGuessAnswer, type SongGuessAnswerTarget } from "./contracts";

type AnswerSource = {
  representativeAnswer: string;
  aliases: readonly string[];
  artist?: string | null;
};

/** Title aliases describe songs; they must never become artist aliases. */
export function transformSongGuessAnswer(source: AnswerSource, target: SongGuessAnswerTarget) {
  const artist = source.artist?.trim();
  if (target !== "title" && (!artist || !normalizeSongGuessAnswer(artist))) {
    throw new Error("song_guess_artist_required");
  }
  const representativeAnswer = target === "title" ? source.representativeAnswer
    : target === "artist" ? artist! : `${artist} - ${source.representativeAnswer}`;
  const aliases = target === "title" ? [...source.aliases]
    : target === "artist" ? [] : source.aliases.map((title) => `${artist} - ${title}`);
  if ([representativeAnswer, ...aliases].some((answer) => answer.length > 200)) {
    throw new Error("invalid_song_guess_target_answer");
  }
  return {
    representativeAnswer,
    normalizedAnswer: normalizeSongGuessAnswer(representativeAnswer),
    aliases,
    normalizedAliases: aliases.map(normalizeSongGuessAnswer),
  };
}

/** Every saved title/alias must match the same catalog entry, and all matching
 * entries must agree on artist. Duplicate titles alone are not provenance. */
export function resolveSongGuessArtist(
  source: AnswerSource,
  catalog: readonly { title: string; aliases: readonly string[]; artist?: string | null }[],
): string | null {
  if (source.artist?.trim()) return source.artist.trim();
  const names = [source.representativeAnswer, ...source.aliases].map(normalizeSongGuessAnswer);
  const matches = catalog.filter((song) => {
    const titles = new Set([song.title, ...song.aliases].map(normalizeSongGuessAnswer));
    return names.every((name) => titles.has(name));
  });
  if (!matches.length || matches.some((song) => !song.artist?.trim())) return null;
  const artists = new Map(matches.map((song) => [normalizeSongGuessAnswer(song.artist!), song.artist!.trim()]));
  return artists.size === 1 ? [...artists.values()][0] : null;
}
