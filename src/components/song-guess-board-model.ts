export type GeneratedClipDraft = {
  tierMs: SongGuessClipTierMs;
  blob: Blob;
  url: string;
};

export type RoundDraft = {
  clientId: string;
  representativeAnswer: string;
  aliasesText: string;
  accessibilityClue: string;
  rightsConfirmed: boolean;
  existingClipAssetIds: [string, string, string] | null;
  existingClipSummary: Array<{
    tierMs: number;
    durationMs: number;
    sizeBytes: number;
  }>;
  sourceBuffer: AudioBuffer | null;
  sourceName: string | null;
  startSeconds: number;
  generatedClips: GeneratedClipDraft[] | null;
};
import type { SongGuessClipTierMs } from "@/lib/song-guess/contracts";
