import { describe, expect, it } from "vitest";
import {
  createSongGuessWavClips,
  encodePcm16Wav,
  maxSongGuessStartSeconds,
  renderMonoPcm,
  validateSongGuessDecodedAudio,
  validateSongGuessStartSeconds,
  type SongGuessAudioBufferLike,
} from "./audio";

function audioBuffer(
  channels: Float32Array[],
  sampleRate = 44_100,
): SongGuessAudioBufferLike {
  return {
    sampleRate,
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    duration: (channels[0]?.length ?? 0) / sampleRate,
    getChannelData: (channel) => channels[channel]!,
  };
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

describe("song-guess deterministic PCM WAV pipeline", () => {
  it("starts at the selected source frame and preserves exact samples", () => {
    const source = new Float32Array(110_250);
    source.fill(-0.5, 0, 44_100);
    source.fill(0.25, 44_100);
    const pcm = renderMonoPcm(audioBuffer([source]), 1, 500);
    expect(pcm).toHaveLength(22_050);
    expect(pcm[0]).toBeCloseTo(0.25, 6);
    expect(pcm.at(-1)).toBeCloseTo(0.25, 6);
  });

  it("writes exact 500/1000/1500ms mono PCM WAV headers and data lengths", () => {
    const source = new Float32Array(44_100 * 3).fill(0.125);
    const clips = createSongGuessWavClips(audioBuffer([source]), 0.25);
    for (const clip of clips) {
      const expectedFrames = (44_100 * clip.tierMs) / 1_000;
      const expectedDataLength = expectedFrames * 2;
      const view = new DataView(clip.bytes.buffer, clip.bytes.byteOffset, clip.bytes.byteLength);
      expect(readAscii(clip.bytes, 0, 4)).toBe("RIFF");
      expect(readAscii(clip.bytes, 8, 4)).toBe("WAVE");
      expect(readAscii(clip.bytes, 36, 4)).toBe("data");
      expect(view.getUint16(22, true)).toBe(1);
      expect(view.getUint32(24, true)).toBe(44_100);
      expect(view.getUint16(34, true)).toBe(16);
      expect(view.getUint32(40, true)).toBe(expectedDataLength);
      expect(clip.bytes.byteLength).toBe(44 + expectedDataLength);
      expect(clip.durationMs).toBe(clip.tierMs);
      expect(clip.mimeType).toBe("audio/wav");
    }
  });

  it("downmixes stereo and multichannel input before encoding", () => {
    const left = new Float32Array(88_200).fill(1);
    const right = new Float32Array(88_200).fill(-0.5);
    const pcm = renderMonoPcm(audioBuffer([left, right]), 0, 500);
    expect(pcm[0]).toBeCloseTo(0.25, 6);
    const wav = encodePcm16Wav(pcm, 44_100);
    expect(new DataView(wav.buffer).getInt16(44, true)).toBeCloseTo(8192, -1);
  });

  it("rejects too-short sources and a start point that would require padding", () => {
    const tooShort = audioBuffer([new Float32Array(44_100)]);
    expect(validateSongGuessDecodedAudio(tooShort)).toBe("source_audio_too_short");

    const exact = audioBuffer([new Float32Array(66_150)]);
    expect(maxSongGuessStartSeconds(exact)).toBe(0);
    expect(validateSongGuessStartSeconds(exact, 0)).toBeNull();
    expect(validateSongGuessStartSeconds(exact, 0.001)).toBe("start_too_close_to_end");
    expect(() => createSongGuessWavClips(exact, 0.001)).toThrow("start_too_close_to_end");
  });

  it("resamples a supported source rate to the fixed 44.1kHz output", () => {
    const source = new Float32Array(48_000 * 2).fill(0.5);
    const pcm = renderMonoPcm(audioBuffer([source], 48_000), 0.25, 1_000);
    expect(pcm).toHaveLength(44_100);
    expect(pcm[10_000]).toBeCloseTo(0.5, 6);
  });
});
