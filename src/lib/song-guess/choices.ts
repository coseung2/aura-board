import { createHash } from "node:crypto";
import { normalizeSongGuessAnswer, type SongGuessChoice } from "./contracts";

type ChoiceRound = { id: string; representativeAnswer: string; aliases: readonly string[] };

/** Stable across a lost create response; no answer index or correctness in public IDs. */
export function buildSongGuessChoices(
  requestId: string,
  rounds: readonly ChoiceRound[],
  catalog: readonly { title: string; aliases: readonly string[] }[] = [],
): SongGuessChoice[][] {
  const digest = (...parts: string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  return rounds.map((round) => {
    const accepted = new Set([round.representativeAnswer, ...round.aliases].map(normalizeSongGuessAnswer));
    const candidates = new Map<string, string>();
    for (const candidate of [
      ...rounds.map((item) => ({ title: item.representativeAnswer, aliases: item.aliases })),
      ...catalog,
    ]) {
      const label = candidate.title.trim();
      const normalized = normalizeSongGuessAnswer(label);
      const overlapsAnswer = [label, ...candidate.aliases].some((answer) => accepted.has(normalizeSongGuessAnswer(answer)));
      if (normalized && label.length <= 200 && !overlapsAnswer) candidates.set(normalized, label);
    }
    const distractors = [...candidates.values()].sort((a, b) =>
      digest(requestId, round.id, "candidate", a).localeCompare(digest(requestId, round.id, "candidate", b))
    ).slice(0, 3);
    if (distractors.length !== 3) throw new Error("insufficient_song_guess_choices");
    return [round.representativeAnswer.trim(), ...distractors].map((label) => ({
      id: digest(requestId, round.id, "choice", label), label,
    })).sort((a, b) => a.id.localeCompare(b.id));
  });
}
