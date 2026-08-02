import {
  SONG_GUESS_CLIP_TIERS_MS,
  type SongGuessClipTierMs,
} from "./contracts";

export const SONG_GUESS_WAV_MIME_TYPE = "audio/wav" as const;
export const SONG_GUESS_OUTPUT_SAMPLE_RATE = 44_100;
export const SONG_GUESS_MAX_SOURCE_SIZE_BYTES = 30 * 1024 * 1024;
export const SONG_GUESS_MAX_SOURCE_DURATION_SECONDS = 15 * 60;
export const SONG_GUESS_MAX_SOURCE_CHANNELS = 8;

export type SongGuessAudioBufferLike = {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  duration: number;
  getChannelData(channel: number): Float32Array;
};

export type SongGuessGeneratedWav = {
  tierMs: SongGuessClipTierMs;
  durationMs: SongGuessClipTierMs;
  mimeType: typeof SONG_GUESS_WAV_MIME_TYPE;
  bytes: Uint8Array;
};

export function validateSongGuessSourceFile(file: Pick<File, "size">): string | null {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return "empty_source_file";
  if (file.size > SONG_GUESS_MAX_SOURCE_SIZE_BYTES) return "source_file_too_large";
  return null;
}

export function validateSongGuessDecodedAudio(
  audio: SongGuessAudioBufferLike,
): string | null {
  if (
    !Number.isFinite(audio.sampleRate) ||
    audio.sampleRate < 8_000 ||
    audio.sampleRate > 192_000 ||
    !Number.isSafeInteger(audio.numberOfChannels) ||
    audio.numberOfChannels < 1 ||
    audio.numberOfChannels > SONG_GUESS_MAX_SOURCE_CHANNELS ||
    !Number.isSafeInteger(audio.length) ||
    audio.length < 1 ||
    !Number.isFinite(audio.duration) ||
    audio.duration <= 0
  ) {
    return "invalid_decoded_audio";
  }
  if (audio.duration < 1.5) return "source_audio_too_short";
  if (audio.duration > SONG_GUESS_MAX_SOURCE_DURATION_SECONDS) {
    return "source_audio_too_long";
  }
  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
    if (audio.getChannelData(channel).length < audio.length) {
      return "invalid_decoded_audio";
    }
  }
  return null;
}

export function maxSongGuessStartSeconds(audio: SongGuessAudioBufferLike): number {
  const requiredFrames = Math.ceil(audio.sampleRate * 1.5);
  const availableStartFrames = Math.max(0, audio.length - requiredFrames);
  return availableStartFrames / audio.sampleRate;
}

export function validateSongGuessStartSeconds(
  audio: SongGuessAudioBufferLike,
  startSeconds: number,
): string | null {
  if (!Number.isFinite(startSeconds) || startSeconds < 0) return "invalid_start_seconds";
  const startFrame = Math.round(startSeconds * audio.sampleRate);
  const requiredFrames = Math.ceil(audio.sampleRate * 1.5);
  if (startFrame + requiredFrames > audio.length) return "start_too_close_to_end";
  return null;
}

export function createSongGuessWavClips(
  audio: SongGuessAudioBufferLike,
  startSeconds: number,
): SongGuessGeneratedWav[] {
  const decodedError = validateSongGuessDecodedAudio(audio);
  if (decodedError) throw new Error(decodedError);
  const startError = validateSongGuessStartSeconds(audio, startSeconds);
  if (startError) throw new Error(startError);

  return SONG_GUESS_CLIP_TIERS_MS.map((tierMs) => {
    const pcm = renderMonoPcm(audio, startSeconds, tierMs);
    return {
      tierMs,
      durationMs: tierMs,
      mimeType: SONG_GUESS_WAV_MIME_TYPE,
      bytes: encodePcm16Wav(pcm, SONG_GUESS_OUTPUT_SAMPLE_RATE),
    };
  });
}

export function renderMonoPcm(
  audio: SongGuessAudioBufferLike,
  startSeconds: number,
  tierMs: SongGuessClipTierMs,
  outputSampleRate = SONG_GUESS_OUTPUT_SAMPLE_RATE,
): Float32Array {
  const startError = validateSongGuessStartSeconds(audio, startSeconds);
  if (startError) throw new Error(startError);
  if (!SONG_GUESS_CLIP_TIERS_MS.includes(tierMs)) throw new Error("invalid_clip_tier");
  if (!Number.isSafeInteger(outputSampleRate) || outputSampleRate < 8_000) {
    throw new Error("invalid_output_sample_rate");
  }

  const outputFrames = Math.round((outputSampleRate * tierMs) / 1_000);
  const sourceStartFrame = Math.round(startSeconds * audio.sampleRate);
  const sourceFramesNeeded = Math.ceil((audio.sampleRate * tierMs) / 1_000);
  if (sourceStartFrame + sourceFramesNeeded > audio.length) {
    throw new Error("start_too_close_to_end");
  }

  const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) =>
    audio.getChannelData(channel),
  );
  const output = new Float32Array(outputFrames);
  const sourceStep = audio.sampleRate / outputSampleRate;

  for (let frame = 0; frame < outputFrames; frame += 1) {
    const sourcePosition = sourceStartFrame + frame * sourceStep;
    const leftIndex = Math.floor(sourcePosition);
    const rightIndex = Math.min(leftIndex + 1, audio.length - 1);
    const fraction = sourcePosition - leftIndex;
    let mixed = 0;
    for (const channel of channels) {
      const left = channel[leftIndex] ?? 0;
      const right = channel[rightIndex] ?? left;
      mixed += left + (right - left) * fraction;
    }
    output[frame] = Math.max(-1, Math.min(1, mixed / channels.length));
  }
  return output;
}

export function encodePcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
    throw new Error("invalid_output_sample_rate");
  }
  const bytesPerSample = 2;
  const channelCount = 1;
  const dataLength = samples.length * bytesPerSample;
  const output = new Uint8Array(44 + dataLength);
  const view = new DataView(output.buffer);

  writeAscii(output, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(output, 8, "WAVE");
  writeAscii(output, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(output, 36, "data");
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    const value = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
    view.setInt16(44 + index * bytesPerSample, value, true);
  }
  return output;
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    target[offset + index] = value.charCodeAt(index);
  }
}
