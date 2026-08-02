import { describe, expect, it } from "vitest";
import {
  isSongGuessSnapshot,
  mergeSongGuessSnapshot,
  normalizeSongGuessAnswer,
  normalizeSongGuessSetup,
  scoreForSongGuessTier,
  validateSongGuessWavBytes,
  type SongGuessSnapshot,
} from "./contracts";

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
      accessibilityClue: "A clue",
      revealedAnswer: null,
      currentClip: {
        assetId: "asset-500",
        tierMs: 500,
        mimeType: "audio/wav",
        durationMs: 500,
        sizeBytes: 100,
      },
    },
    participants: [{ displayName: "Student", score: 0, scoredCurrentRound: false }],
    viewer: { role: "participant", scoredCurrentRound: false },
    ...overrides,
  };
}

describe("song-guess authoritative wire contract", () => {
  it("normalizes only Unicode form, case, and whitespace", () => {
    expect(normalizeSongGuessAnswer("  Bℓue\u00a0Moon ")).toBe("blue moon");
    expect(normalizeSongGuessAnswer("blue-moon")).not.toBe("blue moon");
    expect(normalizeSongGuessSetup({
      rounds: [
        {
          representativeAnswer: " Blue Moon ",
          aliases: ["BlueMoon"],
          clipAssetIds: ["asset-500", "asset-1000", "asset-1500"],
        },
        {
          representativeAnswer: " Second Song ",
          aliases: [],
          accessibilityClue: "A second clue",
          clipAssetIds: ["asset-2-500", "asset-2-1000", "asset-2-1500"],
        },
      ],
    })).toMatchObject({
      rounds: [
        {
          order: 0,
          representativeAnswer: "Blue Moon",
          normalizedAnswer: "blue moon",
          normalizedAliases: ["bluemoon"],
        },
        {
          order: 1,
          representativeAnswer: "Second Song",
          accessibilityClue: "A second clue",
        },
      ],
    });
  });

  it("keeps the fixed tier score contract", () => {
    expect(scoreForSongGuessTier(500)).toBe(1_000);
    expect(scoreForSongGuessTier(1_000)).toBe(700);
    expect(scoreForSongGuessTier(1_500)).toBe(400);
    expect(scoreForSongGuessTier(750)).toBeNull();
  });

  it("rejects spoofed WAV metadata and accepts the deterministic PCM shape", () => {
    const bytes = new Uint8Array(44 + 44_100);
    const view = new DataView(bytes.buffer);
    const write = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
    };
    write(0, "RIFF");
    view.setUint32(4, bytes.length - 8, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 44_100, true);
    view.setUint32(28, 88_200, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, 44_100, true);
    expect(validateSongGuessWavBytes(bytes, 500)).toBeNull();
    bytes[0] = 0;
    expect(validateSongGuessWavBytes(bytes, 500)).toBe("invalid_wav_clip");
  });

  it("accepts only the currently unlocked clip projection", () => {
    const current = snapshot();
    const serialized = JSON.stringify(current);
    expect(serialized).not.toContain("Blue Moon");
    expect(serialized).not.toContain("aliases");
    expect(serialized).not.toContain("asset-1000");
    expect(serialized).not.toContain("asset-1500");
    expect(isSongGuessSnapshot(current)).toBe(true);
    expect(isSongGuessSnapshot({ ...current, answer: "Blue Moon" })).toBe(false);
    expect(isSongGuessSnapshot({
      ...current,
      currentRound: {
        ...current.currentRound,
        currentClip: {
          ...current.currentRound.currentClip!,
          assetId: "asset-1000",
          tierMs: 1_000,
        },
      },
    })).toBe(true);
  });

  it("reveals the answer only after the authoritative reveal phase", () => {
    const current = snapshot();
    expect(isSongGuessSnapshot({
      ...current,
      currentRound: { ...current.currentRound, revealedAnswer: "Blue Moon" },
    })).toBe(false);
    expect(isSongGuessSnapshot({
      ...current,
      phase: "lobby",
      currentRound: {
        ...current.currentRound,
        accessibilityClue: "A clue",
        revealedAnswer: null,
        currentClip: null,
      },
    })).toBe(false);
    expect(isSongGuessSnapshot({
      ...current,
      phase: "reveal",
      currentRound: {
        ...current.currentRound,
        revealedAnswer: "Blue Moon",
        currentClip: null,
      },
    })).toBe(true);
  });

  it("does not allow a setup to omit or duplicate a clip identity", () => {
    expect(() => normalizeSongGuessSetup({
      rounds: [{
        representativeAnswer: "Song",
        clipAssetIds: ["asset-500", "asset-500", "asset-1500"],
      }],
    })).toThrow("invalid_clip_assets");
    expect(() => normalizeSongGuessSetup({
      rounds: [{
        representativeAnswer: "Song",
        aliases: ["song", " Song "],
        clipAssetIds: ["asset-500", "asset-1000", "asset-1500"],
      }],
    })).toThrow("invalid_aliases");
    expect(() => normalizeSongGuessSetup({ rounds: [] })).toThrow("invalid_rounds");
    expect(() => normalizeSongGuessSetup({
      rounds: [
        {
          representativeAnswer: "One",
          clipAssetIds: ["asset-500", "asset-1000", "asset-1500"],
        },
        {
          representativeAnswer: "Two",
          clipAssetIds: ["asset-500", "asset-2-1000", "asset-2-1500"],
        },
      ],
    })).toThrow("invalid_clip_assets");
  });

  it("reconnects monotonically and ignores an old session response", () => {
    expect(mergeSongGuessSnapshot(snapshot({ version: 9 }), "session-1", snapshot({ version: 8 }))?.version).toBe(9);
    expect(mergeSongGuessSnapshot(snapshot({ version: 9 }), "old-session", snapshot({ version: 10 }))?.version).toBe(9);
    expect(mergeSongGuessSnapshot(snapshot({ version: 9 }), "session-1", snapshot({ version: 10 }))?.version).toBe(10);
  });
});
