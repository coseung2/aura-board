import { createHash } from "node:crypto";
import { normalizeSongGuessAnswer, type SongGuessChoice } from "./contracts";

type ChoiceSource = { title: string; aliases: readonly string[]; categories?: readonly string[] };
type ChoiceRound = { id: string; representativeAnswer: string; aliases: readonly string[]; categories?: readonly string[] };

type CatalogIdentity = ChoiceSource & { id?: string; artist?: string | null };

/** Prefer stored provenance. Legacy identity recovery must be unambiguous; a
 * similar-looking title is not evidence of the same song or musical category. */
export function resolveChoiceCategories(
  round: { sourceCatalogSongId?: string | null; representativeAnswer: string; artist?: string | null },
  catalog: readonly CatalogIdentity[],
): readonly string[] | undefined {
  const matches = round.sourceCatalogSongId
    ? catalog.filter((song) => song.id === round.sourceCatalogSongId)
    : catalog.filter((song) => normalizeSongGuessAnswer(song.title) === normalizeSongGuessAnswer(round.representativeAnswer)
      && (!round.artist?.trim() || normalizeSongGuessAnswer(song.artist ?? "") === normalizeSongGuessAnswer(round.artist)));
  return matches.length === 1 && matches[0].categories?.length ? matches[0].categories : undefined;
}

/** Stable opaque IDs and order across retries. Category-less manual packs may
 * use their own authored alternatives, never arbitrary unrelated catalog rows. */
export function buildSongGuessChoices(
  requestId: string,
  rounds: readonly ChoiceRound[],
  catalog: readonly ChoiceSource[] = [],
): SongGuessChoice[][] {
  const digest = (...parts: string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  return rounds.map((round) => {
    const accepted = new Set([round.representativeAnswer, ...round.aliases].map(normalizeSongGuessAnswer));
    const scope = new Set(round.categories ?? []);
    const sources = [
      ...rounds.map((item) => ({ title: item.representativeAnswer, aliases: item.aliases, categories: item.categories })),
      ...(scope.size ? catalog : []),
    ];
    const candidates = new Map<string, { label: string; tokens: string[]; overlap: number }>();
    for (const candidate of sources) {
      const label = candidate.title.trim();
      const normalized = normalizeSongGuessAnswer(label);
      const tokens = [label, ...candidate.aliases].map(normalizeSongGuessAnswer).filter(Boolean);
      const overlap = (candidate.categories ?? []).filter((category) => scope.has(category)).length;
      if (scope.size && overlap === 0) continue;
      // A classical answer must not become obvious among unrelated pop songs,
      // even if both happen to carry the same decade tag.
      if (scope.has("classical") && !candidate.categories?.includes("classical")) continue;
      if (normalized && label.length <= 200 && !tokens.some((token) => accepted.has(token))) {
        const previous = candidates.get(normalized);
        if (!previous || overlap > previous.overlap) candidates.set(normalized, { label, tokens, overlap });
      }
    }
    const ordered = [...candidates.values()].sort((a, b) => b.overlap - a.overlap ||
      digest(requestId, round.id, "candidate", a.label).localeCompare(digest(requestId, round.id, "candidate", b.label)));
    const distractors: string[] = [];
    const used = new Set(accepted);
    for (const candidate of ordered) {
      if (candidate.tokens.some((token) => used.has(token))) continue;
      distractors.push(candidate.label);
      candidate.tokens.forEach((token) => used.add(token));
      if (distractors.length === 3) break;
    }
    if (distractors.length !== 3) throw new Error("insufficient_song_guess_choices");
    return [round.representativeAnswer.trim(), ...distractors].map((label) => ({
      id: digest(requestId, round.id, "choice", label), label,
    })).sort((a, b) => a.id.localeCompare(b.id));
  });
}
