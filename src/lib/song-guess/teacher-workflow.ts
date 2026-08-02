import {
  SONG_GUESS_CLIP_TIERS_MS,
  type SongGuessClipTierMs,
  type SongGuessRoundSetupInput,
  type SongGuessSetupInput,
} from "./contracts";

export type SongGuessGeneratedClipUpload = {
  tierMs: SongGuessClipTierMs;
  blob: Blob;
};

export type SongGuessRoundSaveDraft = {
  representativeAnswer: string;
  aliasesText: string;
  accessibilityClue: string;
  rightsConfirmed: boolean;
  existingClipAssetIds: [string, string, string] | null;
  generatedClips: readonly SongGuessGeneratedClipUpload[] | null;
  sourceSelected: boolean;
};

export type SongGuessUploadedClipDescriptor = {
  id: string;
  tierMs: SongGuessClipTierMs;
};

export type PersistSongGuessRoundPackDependencies<TSetup> = {
  uploadClip: (
    boardId: string,
    blob: Blob,
    tierMs: SongGuessClipTierMs,
  ) => Promise<SongGuessUploadedClipDescriptor>;
  saveSetup: (boardId: string, input: SongGuessSetupInput) => Promise<TSetup>;
  cleanupClip: (boardId: string, assetId: string) => Promise<unknown>;
};

export function parseSongGuessAliases(value: string): string[] {
  return value
    .split(/[\n,]+/u)
    .map((alias) => alias.trim())
    .filter(Boolean);
}

export function validateSongGuessRoundSaveDraft(
  draft: SongGuessRoundSaveDraft,
): string | null {
  if (!draft.representativeAnswer.trim()) return "representative_answer_required";
  if (draft.representativeAnswer.trim().length > 200) return "representative_answer_too_long";
  const aliases = parseSongGuessAliases(draft.aliasesText);
  if (aliases.length > 20) return "too_many_aliases";
  if (aliases.some((alias) => alias.length > 200)) return "alias_too_long";
  if (draft.accessibilityClue.trim().length > 500) return "accessibility_clue_too_long";
  if (draft.sourceSelected && !draft.generatedClips) return "clips_not_generated";
  if (draft.generatedClips) {
    if (!draft.rightsConfirmed) return "rights_confirmation_required";
    if (
      draft.generatedClips.length !== SONG_GUESS_CLIP_TIERS_MS.length ||
      draft.generatedClips.some(
        (clip, index) =>
          clip.tierMs !== SONG_GUESS_CLIP_TIERS_MS[index] ||
          clip.blob.type !== "audio/wav" ||
          clip.blob.size < 45,
      )
    ) {
      return "three_clips_required";
    }
  } else if (!draft.existingClipAssetIds) {
    return "audio_source_required";
  }
  return null;
}

export async function persistSongGuessRoundPack<TSetup>(
  boardId: string,
  drafts: readonly SongGuessRoundSaveDraft[],
  dependencies: PersistSongGuessRoundPackDependencies<TSetup>,
): Promise<TSetup> {
  if (drafts.length < 1) throw new Error("round_required");
  if (drafts.length > 50) throw new Error("too_many_rounds");
  for (const draft of drafts) {
    const validationError = validateSongGuessRoundSaveDraft(draft);
    if (validationError) throw new Error(validationError);
  }

  const uploadedAssetIds: string[] = [];
  const rounds: SongGuessRoundSetupInput[] = [];
  try {
    for (const draft of drafts) {
      let clipAssetIds = draft.existingClipAssetIds;
      if (draft.generatedClips) {
        const nextIds: string[] = [];
        for (const clip of draft.generatedClips) {
          const uploaded = await dependencies.uploadClip(boardId, clip.blob, clip.tierMs);
          if (uploaded.tierMs !== clip.tierMs || !uploaded.id) {
            throw new Error("invalid_uploaded_clip");
          }
          uploadedAssetIds.push(uploaded.id);
          nextIds.push(uploaded.id);
        }
        clipAssetIds = nextIds as [string, string, string];
      }
      if (!clipAssetIds) throw new Error("three_clips_required");
      rounds.push({
        representativeAnswer: draft.representativeAnswer.trim(),
        aliases: parseSongGuessAliases(draft.aliasesText),
        accessibilityClue: draft.accessibilityClue.trim() || null,
        clipAssetIds,
      });
    }
    return await dependencies.saveSetup(boardId, { rounds });
  } catch (error) {
    await Promise.allSettled(
      uploadedAssetIds.map((assetId) => dependencies.cleanupClip(boardId, assetId)),
    );
    throw error;
  }
}
