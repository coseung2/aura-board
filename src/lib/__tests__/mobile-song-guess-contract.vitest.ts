import { describe, expect, it } from "vitest";
import {
  isSongGuessSnapshot,
  makeSongGuessCommand,
  mergeSongGuessSnapshot,
  type SongGuessSnapshot,
} from "../../../apps/mobile/lib/song-guess-contract";

function snapshot(
  overrides: Partial<SongGuessSnapshot> = {},
): SongGuessSnapshot {
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
    participants: [
      { displayName: "학생", score: 0, scoredCurrentRound: false },
    ],
    viewer: { role: "participant", scoredCurrentRound: false },
    ...overrides,
  };
}

function v2Snapshot(
  overrides: Partial<SongGuessSnapshot> = {},
): SongGuessSnapshot {
  const base = snapshot();
  return {
    ...base,
    rulesVersion: 2,
    stateSchemaVersion: 2,
    currentRound: {
      ...base.currentRound,
      startedAtMs: 1_000,
      deadlineAtMs: 31_000,
      maxScore: 1_000,
      ...overrides.currentRound,
    },
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
        currentRound: {
          ...snapshot().currentRound,
          representativeAnswer: "비밀 정답",
        },
      }),
    ).toBe(false);
  });

  it("keeps v1 snapshots valid when timing fields are absent", () => {
    const legacy = snapshot();
    expect(legacy.rulesVersion).toBe(1);
    expect(legacy.currentRound.startedAtMs).toBeUndefined();
    expect(isSongGuessSnapshot(legacy)).toBe(true);
  });

  it("accepts teacher-only YouTube clips and optional joined/pet projection fields", () => {
    const current = snapshot({
      currentRound: {
        ...snapshot().currentRound,
        currentClip: {
          assetId: "clip-youtube",
          tierMs: 15_000,
          mimeType: "video/youtube",
          durationMs: 15_000,
          sizeBytes: 0,
        },
      },
      participants: [
        {
          displayName: "학생",
          score: 200,
          scoredCurrentRound: true,
          joined: true,
          roundScore: 200,
          previousRank: 2,
          participantId: "student-1",
          representativePet: {
            color: "mint",
            growthStage: 2,
            equippedItemKeys: [],
            hiddenItemKeys: [],
            equippedTitleKey: null,
          },
        },
      ],
      viewer: {
        role: "participant",
        scoredCurrentRound: true,
        joined: true,
        participantIndex: 0,
      },
    });
    expect(isSongGuessSnapshot(current)).toBe(true);
  });

  it("requires a valid server-authored timing window for v2 snapshots", () => {
    const current = v2Snapshot();
    expect(isSongGuessSnapshot(current)).toBe(true);
    expect(
      isSongGuessSnapshot({
        ...current,
        currentRound: { ...current.currentRound, startedAtMs: -1 },
      }),
    ).toBe(false);
    expect(
      isSongGuessSnapshot({
        ...current,
        currentRound: { ...current.currentRound, deadlineAtMs: 32_000 },
      }),
    ).toBe(false);
    expect(
      isSongGuessSnapshot({
        ...current,
        currentRound: { ...current.currentRound, maxScore: 900 },
      }),
    ).toBe(false);
  });

  it("rejects answer leakage before reveal and accepts the revealed answer afterwards", () => {
    expect(
      isSongGuessSnapshot({
        ...snapshot(),
        currentRound: {
          ...snapshot().currentRound,
          revealedAnswer: "노래 제목",
        },
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
    expect(
      mergeSongGuessSnapshot(current, "session-1", snapshot({ version: 4 })),
    ).toBe(current);
    expect(
      mergeSongGuessSnapshot(
        current,
        "session-1",
        snapshot({ sessionId: "session-2", version: 6 }),
      ),
    ).toBe(current);
  });

  it("creates an idempotent request envelope against the visible version", () => {
    const request = makeSongGuessCommand(snapshot({ version: 9 }), {
      type: "guess",
      text: "정답",
      roundId: "round-1",
    });
    expect(request).toMatchObject({
      expectedVersion: 9,
      commandSchemaVersion: 1,
      command: { type: "guess", text: "정답", roundId: "round-1" },
    });
    expect(request.requestId).toMatch(/^song_guess_guess_/);
    const join = makeSongGuessCommand(
      snapshot({
        phase: "lobby",
        currentRound: { ...snapshot().currentRound, currentClip: null },
      }),
      { type: "join" },
    );
    expect(join.command).toEqual({ type: "join" });
    expect(join.requestId).toMatch(/^song_guess_join_/);
  });
});
