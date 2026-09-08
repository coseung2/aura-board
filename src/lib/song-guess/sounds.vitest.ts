import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSongGuessSoundController,
  type SongGuessAudioElement,
} from "./sounds";

type FakeAudio = SongGuessAudioElement & {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
};

function fakeAudio(src: string, play: () => Promise<void> = async () => undefined): FakeAudio {
  return {
    src,
    currentTime: 0,
    volume: 0,
    preload: "",
    onended: null,
    play: vi.fn(play),
    pause: vi.fn(),
  };
}

describe("song-guess sound controller", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    window.localStorage.clear();
  });

  it("does not initialize or play audio before an explicit unlock", async () => {
    const factory = vi.fn(() => fakeAudio("/sounds/song-guess/join.ogg"));
    const sounds = createSongGuessSoundController({ audioFactory: factory });

    await expect(sounds.play("start")).resolves.toBe(false);
    expect(factory).not.toHaveBeenCalled();
    await expect(sounds.unlock()).resolves.toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("uses one media element, replaces a cue instead of overlapping, and de-duplicates repeats", async () => {
    const player = fakeAudio("/sounds/song-guess/join.ogg");
    const factory = vi.fn(() => player);
    let clock = 10_000;
    const sounds = createSongGuessSoundController({ audioFactory: factory, now: () => clock });
    await sounds.unlock();

    await expect(sounds.play("correct")).resolves.toBe(true);
    expect(player.src).toBe("/sounds/song-guess/correct.ogg");
    expect(player.play).toHaveBeenCalledTimes(2);
    clock += 50;
    await expect(sounds.play("correct")).resolves.toBe(false);
    expect(player.play).toHaveBeenCalledTimes(2);
    clock += 200;
    await expect(sounds.play("wrong")).resolves.toBe(true);
    expect(player.pause).toHaveBeenCalledTimes(2);
    expect(player.src).toBe("/sounds/song-guess/wrong.ogg");
  });

  it("stops on mute, persists the setting, and skips cues while the page is hidden", async () => {
    const player = fakeAudio("/sounds/song-guess/join.ogg");
    const sounds = createSongGuessSoundController({ audioFactory: () => player });
    await sounds.unlock();
    await expect(sounds.play("join")).resolves.toBe(true);

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(player.pause).toHaveBeenCalledTimes(2);
    await expect(sounds.play("start")).resolves.toBe(false);

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    await expect(sounds.play("start")).resolves.toBe(true);
    sounds.setMuted(true);
    expect(sounds.isMuted()).toBe(true);
    expect(player.pause).toHaveBeenCalledTimes(3);
    expect(window.localStorage.getItem("aura-board.song-guess.sounds-muted")).toBe("1");
    await expect(sounds.play("start")).resolves.toBe(false);

    sounds.setMuted(false);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await expect(sounds.play("start")).resolves.toBe(false);
    expect(player.play).toHaveBeenCalledTimes(3);
  });

  it("cancels a pending play when stopped or disposed", async () => {
    let resolvePlay!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolvePlay = resolve;
    });
    let playCount = 0;
    const player = fakeAudio("/sounds/song-guess/join.ogg", () => {
      playCount += 1;
      return playCount === 1 ? Promise.resolve() : pending;
    });
    const sounds = createSongGuessSoundController({ audioFactory: () => player });
    await sounds.unlock();
    const pendingResult = sounds.play("start");
    sounds.stop();
    resolvePlay();
    await expect(pendingResult).resolves.toBe(false);

    const next = sounds.play("start");
    sounds.dispose();
    resolvePlay();
    await expect(next).resolves.toBe(false);
    await expect(sounds.play("correct")).resolves.toBe(false);
    expect(player.pause).toHaveBeenCalledTimes(3);
  });

  it("returns false when the browser rejects playback", async () => {
    const player = fakeAudio("/sounds/song-guess/join.ogg", async () => {
      throw new Error("autoplay blocked");
    });
    const sounds = createSongGuessSoundController({ audioFactory: () => player });
    await sounds.unlock();
    await expect(sounds.play("start")).resolves.toBe(false);
    expect(player.pause).toHaveBeenCalledTimes(1);
  });
});
