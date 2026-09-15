import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { SongGuessSnapshot } from "../../lib/song-guess-contract";
import { loadSongGuessAudioSource, monotonicNow } from "../../lib/song-guess";

/** One media lifecycle per session/round/asset. Loop at the actual media boundary,
 * never at a guessed clip duration. The server's deadline alone ends playback. */
export function useSongGuessRoundAudio(snapshot: SongGuessSnapshot | null, muted: boolean) {
  const player = useAudioPlayer(null, { downloadFirst: true, updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const clip = snapshot?.phase === "guessing" ? snapshot.currentRound.currentClip : null;
  const key = snapshot && clip ? `${snapshot.sessionId}:${snapshot.currentRound.roundId}:${clip.assetId}` : null;
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [visibilityVersion, setVisibilityVersion] = useState(0);
  const current = useRef({ snapshot, key });
  current.current = { snapshot, key };
  const mounted = useRef(true);
  const generation = useRef(0);
  const deadline = useRef<number | null>(null);
  const started = useRef<string | null>(null);
  const appState = useRef(AppState.currentState);
  const resumeAfter = useRef<SongGuessSnapshot | null>(null);

  const allowed = useCallback(() => mounted.current && current.current.key !== null
    && current.current.snapshot?.phase === "guessing" && appState.current === "active"
    && (resumeAfter.current === null || resumeAfter.current !== current.current.snapshot)
    && (deadline.current === null || monotonicNow() < deadline.current), []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; ++generation.current; player.pause(); };
  }, [player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    const end = snapshot?.phase === "guessing" ? snapshot.currentRound.deadlineAtMs : null;
    const remaining = end == null || !snapshot ? null : Math.max(0, end - snapshot.serverTimeMs);
    deadline.current = remaining === null ? null : monotonicNow() + remaining;
    if (remaining === null) return;
    const timer = setTimeout(() => player.pause(), remaining);
    return () => clearTimeout(timer);
  }, [snapshot?.serverTimeMs, snapshot?.version, snapshot?.phase, snapshot?.currentRound.deadlineAtMs, key, player]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      appState.current = next;
      if (next !== "active") {
        resumeAfter.current = current.current.snapshot;
        started.current = null;
        player.pause();
      }
      // A foreground event alone is not evidence that the old round is still
      // current. useBoardRealtime must reconcile before we resume it.
      setVisibilityVersion((value) => value + 1);
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    const version = ++generation.current;
    let disposed = false;
    started.current = null;
    setReadyKey(null);
    setError(null);
    player.pause();
    player.replace(null);
    if (!key || !clip || !snapshot) { setPreparing(false); return; }
    if (!clip.mimeType.startsWith("audio/")) {
      setPreparing(false); setError("음원 파일이 없는 문제예요."); return;
    }
    setPreparing(true);
    void loadSongGuessAudioSource(snapshot.sessionId, clip.assetId).then((source) => {
      if (disposed || version !== generation.current || !mounted.current || current.current.key !== key) return;
      if (!source) throw new Error("audio_source_missing");
      player.replace(source);
      player.loop = true;
      setReadyKey(key);
    }).catch(() => {
      if (!disposed && version === generation.current) setError("음원을 불러오지 못했어요.");
    }).finally(() => {
      if (!disposed && version === generation.current) setPreparing(false);
    });
    return () => { disposed = true; player.pause(); };
  }, [key, clip?.mimeType, player, retryCount]);

  useEffect(() => {
    if (!allowed() || !key || readyKey !== key || preparing || error || !status.isLoaded) return;
    if (started.current === key) return;
    try {
      player.loop = true;
      player.play();
      started.current = key;
      resumeAfter.current = null;
    } catch { setError("재생을 시작하지 못했어요."); }
  }, [allowed, key, readyKey, preparing, error, status.isLoaded, snapshot, visibilityVersion, player]);

  useEffect(() => {
    if (key && readyKey === key && status.playbackState === "error") {
      player.pause();
      setError("음원을 재생하지 못했어요.");
    }
  }, [key, readyKey, status.playbackState, player]);

  const retry = useCallback(() => {
    if (allowed()) setRetryCount((value) => value + 1);
  }, [allowed]);

  return { player, preparing, error, playing: status.playing, retry };
}
