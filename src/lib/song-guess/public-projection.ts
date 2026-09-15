import type { SongGuessSnapshot } from "./contracts";

/** Defense at the API boundary for rolling engine deployments and stored v2
 * receipts. New engine snapshots already have roundScore=0 before reveal, so
 * this operation is idempotent and never subtracts the hidden gain twice. */
export function projectSongGuessPublicSnapshot(snapshot: SongGuessSnapshot): SongGuessSnapshot {
  if (snapshot.phase !== "guessing") return snapshot;
  return {
    ...snapshot,
    participants: snapshot.participants.map((participant) => ({
      ...participant,
      score: Math.max(0, participant.score - (participant.roundScore ?? 0)),
      ...(participant.roundScore === undefined ? {} : { roundScore: 0 }),
      scoredCurrentRound: false,
    })),
    viewer: snapshot.answerMode === "multiple-choice"
      ? { ...snapshot.viewer, scoredCurrentRound: false }
      : snapshot.viewer,
  };
}
