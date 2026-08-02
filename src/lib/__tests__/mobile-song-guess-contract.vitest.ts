import { describe, expect, it } from "vitest";
import {
  isSongGuessSnapshot,
  makeSongGuessCommand,
  mergeSongGuessSnapshot,
  type SongGuessSnapshot,
} from "../../../apps/mobile/lib/song-guess-contract";

function snapshot(overrides: Partial<SongGuessSnapshot> = {}): SongGuessSnapshot {
  return {
    sessionId: "session-1",
    boardId: "board-1",
    gameKind: "song-guess",
    version: 3,
    serverTimeMs: 1_000,
    rulesVersion: 1,
    stateSchemaVersion: 1,
    previousSessionId: null,
    phase: "guessing",
    currentRound: {
      roundId: "round-1",
      order: 0,
      accessibilityClue: "가사가 없는 구간",
      revealedAnswer: null,
      currentClip: {
        assetId: "clip-500",
        tierMs: 500,
        mimeType: "audio/wav",
        durationMs: 500,
        sizeBytes: 44_144,
      },
    },
    participants: [{ displayName: "학생", score: 0, scoredCurrentRound: false }],
    viewer: { role: "participant", scoredCurrentRound: false },
    ...overrides,
  };
}

describe("mobile song guess contract", () => {
  it("accepts only the currently unlocked clip without hidden answer fields", () => {
    expect(isSongGuessSnapshot(snapshot())).toBe(true);
    expect(isSongGuessSnapshot({ ...snapshot(), futureClips: [] })).toBe(false);
    expect(
      isSongGuessSnapshot({
        ...snapshot(),
        currentRound: { ...snapshot().currentRound, representativeAnswer: "비밀 정답" },
      }),
    ).toBe(false);
  });

  it("rejects answer leakage before reveal and accepts the revealed answer afterwards", () => {
    expect(
      isSongGuessSnapshot({
        ...snapshot(),
        currentRound: { ...snapshot().currentRound, revealedAnswer: "노래 제목" },
      }),
    ).toBe(false);

    expect(
      isSongGuessSnapshot(
        snapshot({
          phase: "reveal",
          currentRound: {
            ...snapshot().currentRound,
            currentClip: null,
            revealedAnswer: "노래 제목",
          },
        }),
      ),
    ).toBe(true);
  });

  it("keeps accessibility clues out of draft and lobby snapshots", () => {
    expect(
      isSongGuessSnapshot(
        snapshot({
          phase: "lobby",
          currentRound: { ...snapshot().currentRound, currentClip: null },
        }),
      ),
    ).toBe(false);
  });

  it("never rolls back or crosses sessions while merging", () => {
    const current = snapshot({ version: 5 });
    expect(mergeSongGuessSnapshot(current, "session-1", snapshot({ version: 4 }))).toBe(current);
    expect(
      mergeSongGuessSnapshot(current, "session-1", snapshot({ sessionId: "session-2", version: 6 })),
    ).toBe(current);
  });

  it("creates an idempotent request envelope against the visible version", () => {
    const request = makeSongGuessCommand(snapshot({ version: 9 }), { type: "guess", text: "정답" });
    expect(request).toMatchObject({
      expectedVersion: 9,
      commandSchemaVersion: 1,
      command: { type: "guess", text: "정답" },
    });
    expect(request.requestId).toMatch(/^song_guess_guess_/);
  });
});
