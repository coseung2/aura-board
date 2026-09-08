/**
 * Small UI cues for the song-guess game.
 *
 * The controller deliberately does not start audio until `unlock()` is called.
 * Call that method from the same user gesture that starts or joins a game. A
 * single media element is reused so cues never overlap, and `stop()`/`dispose()`
 * cancel an in-flight `play()` promise when a round or component unmounts.
 */

export type SongGuessSoundCue =
  | "join"
  | "start"
  | "correct"
  | "wrong"
  | "round-results"
  | "podium"
  | "countdown";

export type SongGuessAudioElement = {
  src: string;
  currentTime: number;
  volume: number;
  preload: string;
  onended: ((event: Event) => void) | null;
  play: () => Promise<void> | void;
  pause: () => void;
  load?: () => void;
};

export type SongGuessSoundControllerOptions = {
  /** Base URL for the bundled cues. Useful for a CDN or a test fixture. */
  basePath?: string;
  /** Start muted; otherwise the persisted setting is used when available. */
  initiallyMuted?: boolean;
  /** Persist the mute preference under this key. Set to null to disable. */
  storageKey?: string | null;
  /** Override browser storage (or pass null to disable persistence). */
  storage?: Storage | null;
  /** Inject a media element factory for tests or an alternate audio backend. */
  audioFactory?: (src: string) => SongGuessAudioElement | null;
  /** Used to make cue de-duplication deterministic in tests. */
  now?: () => number;
  /** Ignore a repeated cue within this many milliseconds. */
  dedupeMs?: number;
  /** Cue volume, clamped to the browser's 0..1 range. */
  volume?: number;
};

export type SongGuessSoundController = {
  /** Initialize the media element. Invoke from a user gesture. */
  unlock: () => Promise<boolean> | boolean;
  /** Play a cue if unlocked, audible, visible, and not already disposed. */
  play: (cue: SongGuessSoundCue) => Promise<boolean>;
  /** Stop the active cue and cancel any pending play operation. */
  stop: () => void;
  /** Change and persist the mute setting. Muting immediately stops playback. */
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  /** Release the media element and prevent future playback. */
  dispose: () => void;
};

const DEFAULT_STORAGE_KEY = "aura-board.song-guess.sounds-muted";
const DEFAULT_BASE_PATH = "/sounds/song-guess";
const DEFAULT_DEDUPE_MS = 180;
const CUE_FILES: Record<SongGuessSoundCue, string> = {
  join: "join.ogg",
  start: "start.ogg",
  correct: "correct.ogg",
  wrong: "wrong.ogg",
  "round-results": "round-results.ogg",
  podium: "podium.ogg",
  countdown: "countdown.ogg",
};

function clampVolume(value: number | undefined): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value as number)) : 0.55;
}

function browserAudioFactory(src: string): SongGuessAudioElement | null {
  if (typeof Audio === "undefined") return null;
  const audio = new Audio(src);
  audio.preload = "auto";
  return audio;
}

function readMuted(storage: Storage | null, key: string | null): boolean {
  if (!storage || !key) return false;
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeMuted(storage: Storage | null, key: string | null, muted: boolean): void {
  if (!storage || !key) return;
  try {
    storage.setItem(key, muted ? "1" : "0");
  } catch {
    // Private browsing and blocked storage should not disable game audio.
  }
}

function defaultStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isDocumentHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

export function createSongGuessSoundController(
  options: SongGuessSoundControllerOptions = {},
): SongGuessSoundController {
  const basePath = (options.basePath ?? DEFAULT_BASE_PATH).replace(/\/$/, "");
  const storageKey = options.storageKey === undefined ? DEFAULT_STORAGE_KEY : options.storageKey;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const audioFactory = options.audioFactory ?? browserAudioFactory;
  const now = options.now ?? (() => Date.now());
  const dedupeMs = Math.max(0, options.dedupeMs ?? DEFAULT_DEDUPE_MS);
  const volume = clampVolume(options.volume);

  let muted = options.initiallyMuted ?? readMuted(storage, storageKey);
  let unlocked = false;
  let disposed = false;
  let audio: SongGuessAudioElement | null = null;
  let activeCue: SongGuessSoundCue | null = null;
  let lastCueAt = Number.NEGATIVE_INFINITY;
  let generation = 0;
  let unlockPromise: Promise<boolean> | null = null;
  let visibilityHandler: (() => void) | null = null;

  if (typeof document !== "undefined") {
    visibilityHandler = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", visibilityHandler);
  }

  function ensureAudio(): SongGuessAudioElement | null {
    if (audio || disposed) return audio;
    audio = audioFactory(`${basePath}/${CUE_FILES.join}`);
    if (!audio) return null;
    audio.preload = "auto";
    audio.volume = volume;
    return audio;
  }

  function stop(): void {
    generation += 1;
    const wasActive = activeCue !== null;
    activeCue = null;
    if (!audio || (!wasActive && unlockPromise === null)) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // A detached or already-failed media element is safe to discard.
    }
  }

  function unlock(): Promise<boolean> {
    if (disposed) return Promise.resolve(false);
    if (unlocked) return Promise.resolve(true);
    if (unlockPromise) return unlockPromise;
    const player = ensureAudio();
    if (!player) return Promise.resolve(false);

    // Calling play from the initiating pointer/key gesture establishes the
    // browser's media permission. Keep this priming play silent and rewind it
    // before restoring the normal cue volume, so unlocking never announces a
    // join cue by itself.
    const token = generation;
    player.src = `${basePath}/${CUE_FILES.join}`;
    player.currentTime = 0;
    player.volume = 0;
    let attempt: Promise<void> | void;
    try {
      attempt = player.play();
    } catch {
      attempt = Promise.reject(new Error("song_guess_audio_unlock_failed"));
    }
    const promise = Promise.resolve(attempt)
      .then(() => {
        if (disposed || generation !== token) return false;
        player.pause();
        player.currentTime = 0;
        player.volume = muted ? 0 : volume;
        unlocked = true;
        return true;
      })
      .catch(() => {
        if (generation === token) {
          try {
            player.pause();
            player.currentTime = 0;
            player.volume = muted ? 0 : volume;
          } catch {
            // Ignore a media element that rejected before it could be reset.
          }
        }
        return false;
      });
    unlockPromise = promise;
    void promise.finally(() => {
      if (unlockPromise === promise) unlockPromise = null;
    });
    return promise;
  }

  async function play(cue: SongGuessSoundCue): Promise<boolean> {
    if (unlockPromise && !(await unlockPromise)) return false;
    if (disposed || !unlocked || muted || isDocumentHidden()) return false;
    const timestamp = now();
    if (activeCue === cue && timestamp - lastCueAt < dedupeMs) return false;

    const player = ensureAudio();
    if (!player) return false;
    stop();
    const token = generation;
    activeCue = cue;
    lastCueAt = timestamp;
    player.src = `${basePath}/${CUE_FILES[cue]}`;
    player.currentTime = 0;
    player.volume = volume;
    player.onended = () => {
      if (generation === token) activeCue = null;
    };

    try {
      await Promise.resolve(player.play());
    } catch {
      if (generation === token) {
        activeCue = null;
        try {
          player.pause();
        } catch {
          // Ignore a media element that failed before it could be paused.
        }
      }
      return false;
    }
    // `stop`, `setMuted`, and `dispose` pause the element before bumping the
    // generation. Avoid pausing a second time when their cancellation wins a
    // race with this pending play promise.
    if (disposed || generation !== token || muted) return false;
    return true;
  }

  function setMuted(nextMuted: boolean): void {
    muted = nextMuted;
    writeMuted(storage, storageKey, muted);
    if (muted) stop();
  }

  function dispose(): void {
    if (disposed) return;
    stop();
    disposed = true;
    unlocked = false;
    if (visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", visibilityHandler);
      visibilityHandler = null;
    }
    if (audio) audio.onended = null;
    audio = null;
  }

  return {
    unlock,
    play,
    stop,
    setMuted,
    isMuted: () => muted,
    dispose,
  };
}

export { CUE_FILES as SONG_GUESS_SOUND_FILES };
