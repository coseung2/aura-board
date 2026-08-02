import { describe, expect, it, vi } from "vitest";
import {
  parseSongGuessAliases,
  persistSongGuessRoundPack,
  validateSongGuessRoundSaveDraft,
  type SongGuessRoundSaveDraft,
} from "./teacher-workflow";

function existingDraft(answer = "첫 번째 노래"): SongGuessRoundSaveDraft {
  return {
    representativeAnswer: answer,
    aliasesText: "별칭 하나, 별칭 둘\n별칭 셋",
    accessibilityClue: "가사 없이도 참여할 수 있는 단서",
    rightsConfirmed: false,
    existingClipAssetIds: ["old-500", "old-1000", "old-1500"],
    generatedClips: null,
    sourceSelected: false,
  };
}

function generatedDraft(answer = "새 노래"): SongGuessRoundSaveDraft {
  return {
    representativeAnswer: answer,
    aliasesText: "새 별칭",
    accessibilityClue: "",
    rightsConfirmed: true,
    existingClipAssetIds: null,
    generatedClips: [500, 1000, 1500].map((tierMs) => ({
      tierMs: tierMs as 500 | 1000 | 1500,
      blob: new Blob([new Uint8Array(tierMs / 10)], { type: "audio/wav" }),
    })),
    sourceSelected: true,
  };
}

describe("song-guess teacher pack workflow", () => {
  it("requires explicit rights confirmation before derived clips can be uploaded", () => {
    const draft = generatedDraft();
    draft.rightsConfirmed = false;
    expect(validateSongGuessRoundSaveDraft(draft)).toBe("rights_confirmation_required");
  });

  it("parses explicit comma and line aliases without fuzzy expansion", () => {
    expect(parseSongGuessAliases(" 첫째,둘째\n셋째 ,, ")).toEqual(["첫째", "둘째", "셋째"]);
  });

  it("uploads only three derivative blobs and saves the ordered opaque asset payload", async () => {
    const uploadClip = vi.fn(async (_boardId: string, blob: Blob, tierMs: number) => ({
      id: `new-${tierMs}`,
      tierMs,
      observedType: blob.type,
    }));
    const saveSetup = vi.fn(async (_boardId: string, input: unknown) => ({ input }));
    const cleanupClip = vi.fn();

    await persistSongGuessRoundPack(
      "board-1",
      [existingDraft("먼저"), generatedDraft("나중")],
      { uploadClip, saveSetup, cleanupClip },
    );

    expect(uploadClip).toHaveBeenCalledTimes(3);
    expect(uploadClip.mock.calls.map((call) => [call[1].type, call[2]])).toEqual([
      ["audio/wav", 500],
      ["audio/wav", 1000],
      ["audio/wav", 1500],
    ]);
    expect(uploadClip.mock.calls.flat()).not.toContain("원본.mp3");
    expect(saveSetup).toHaveBeenCalledWith("board-1", {
      rounds: [
        {
          representativeAnswer: "먼저",
          aliases: ["별칭 하나", "별칭 둘", "별칭 셋"],
          accessibilityClue: "가사 없이도 참여할 수 있는 단서",
          clipAssetIds: ["old-500", "old-1000", "old-1500"],
        },
        {
          representativeAnswer: "나중",
          aliases: ["새 별칭"],
          accessibilityClue: null,
          clipAssetIds: ["new-500", "new-1000", "new-1500"],
        },
      ],
    });
    expect(cleanupClip).not.toHaveBeenCalled();
  });

  it("cleans every successful derivative after a partial upload failure", async () => {
    const uploadClip = vi.fn(async (_boardId: string, _blob: Blob, tierMs: number) => {
      if (tierMs === 1500) throw new Error("storage_unavailable");
      return { id: `partial-${tierMs}`, tierMs };
    });
    const saveSetup = vi.fn();
    const cleanupClip = vi.fn(async () => undefined);

    await expect(
      persistSongGuessRoundPack("board-1", [generatedDraft()], {
        uploadClip,
        saveSetup,
        cleanupClip,
      }),
    ).rejects.toThrow("storage_unavailable");

    expect(saveSetup).not.toHaveBeenCalled();
    expect(cleanupClip.mock.calls.map((call) => call[1])).toEqual([
      "partial-500",
      "partial-1000",
    ]);
  });

  it("cleans uploaded assets if the atomic setup save fails", async () => {
    const uploadClip = vi.fn(async (_boardId: string, _blob: Blob, tierMs: number) => ({
      id: `new-${tierMs}`,
      tierMs,
    }));
    const cleanupClip = vi.fn(async () => undefined);

    await expect(
      persistSongGuessRoundPack("board-1", [generatedDraft()], {
        uploadClip,
        saveSetup: async () => {
          throw new Error("song_guess_setup_locked");
        },
        cleanupClip,
      }),
    ).rejects.toThrow("song_guess_setup_locked");

    expect(cleanupClip).toHaveBeenCalledTimes(3);
  });
});
