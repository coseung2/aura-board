import { describe, expect, it } from "vitest";
import type { SongGuessSnapshot } from "./contracts";
import { projectSongGuessPublicSnapshot } from "./public-projection";

const snapshot = (): SongGuessSnapshot => ({
  sessionId: "s", boardId: "b", gameKind: "song-guess", version: 4, serverTimeMs: 50,
  rulesVersion: 2, stateSchemaVersion: 2, previousSessionId: null, phase: "guessing", answerMode: "multiple-choice",
  currentRound: { roundId: "r", order: 1, currentClip: null, accessibilityClue: null, revealedAnswer: null },
  participants: [{ displayName: "One", score: 1800, roundScore: 900, scoredCurrentRound: true },
    { displayName: "Two", score: 1000, roundScore: 0, scoredCurrentRound: false }],
  viewer: { role: "participant", joined: true, scoredCurrentRound: true, answeredCurrentRound: true, selectedChoiceId: "opaque-choice" },
});

describe("song public score projection", () => {
  it("keeps the last revealed score/ranking while a current answer is private", () => {
    const state = snapshot(); const next = projectSongGuessPublicSnapshot(state);
    expect(next.participants.map((p) => p.score)).toEqual([900, 1000]);
    expect(next.participants.every((p) => !p.scoredCurrentRound && p.roundScore === 0)).toBe(true);
    expect(next.viewer).toMatchObject({ scoredCurrentRound: false, answeredCurrentRound: true, selectedChoiceId: "opaque-choice" });
    expect(state.participants[0].score).toBe(1800);
    expect(projectSongGuessPublicSnapshot(next)).toEqual(next);
  });
  it("does not mask a revealed or terminal result", () => {
    for (const phase of ["reveal", "finished"] as const) {
      const state = { ...snapshot(), phase };
      expect(projectSongGuessPublicSnapshot(state)).toBe(state);
    }
  });
  it("preserves private text-answer lock without exposing public correct counts", () => {
    const next = projectSongGuessPublicSnapshot({ ...snapshot(), answerMode: "text" });
    expect(next.viewer.scoredCurrentRound).toBe(true);
    expect(next.participants.every((p) => !p.scoredCurrentRound)).toBe(true);
  });
});
