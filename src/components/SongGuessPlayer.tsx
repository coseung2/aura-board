"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SongGuessClipSnapshot } from "@/lib/song-guess/contracts";
import { songGuessClipUrl } from "@/lib/song-guess/browser-client";
import { SongGuessTeacherTimer } from "./SongGuessTeacherTimer";
import controls from "./SongGuessBoard.module.css";
import styles from "./SongGuessGame.module.css";

type Props = {
  sessionId: string;
  clip: SongGuessClipSnapshot;
  onPlayingChange?: (playing: boolean) => void;
  teacher?: boolean;
  muted?: boolean;
  remainingSeconds?: number | null;
  remainingMs?: number | null;
  roundDurationSeconds?: number | null;
};

/** Playback belongs to the round timeline. HTML media looping uses the actual
 * asset boundary; it must not be implemented as a hardcoded-duration interval. */
export function SongGuessPlayer({ sessionId, clip, onPlayingChange, teacher = false,
  muted = false, remainingSeconds = null, remainingMs, roundDurationSeconds = null }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const active = useRef(false);
  const deadline = useRef<number | null>(null);
  const notify = useRef(onPlayingChange);
  notify.current = onPlayingChange;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"blocked" | "failed" | null>(null);
  const hasAudio = clip.mimeType.startsWith("audio/");
  const source = songGuessClipUrl(sessionId, clip.assetId);
  const timeLeft = remainingMs === undefined ? (remainingSeconds === null ? null : remainingSeconds * 1000) : remainingMs;
  const expired = timeLeft !== null && timeLeft <= 0;

  const allowed = useCallback(() => active.current && !document.hidden
    && (deadline.current === null || performance.now() < deadline.current), []);
  const play = useCallback(async () => {
    const player = audio.current;
    if (!player || !allowed()) return;
    setLoading(true); setError(null);
    try {
      if (player.error) player.load();
      if (player.ended) player.currentTime = 0;
      await player.play();
      if (!allowed()) player.pause();
    } catch (cause) {
      if (allowed()) setError(cause instanceof DOMException && cause.name === "NotAllowedError" ? "blocked" : "failed");
      notify.current?.(false);
    } finally {
      if (active.current) setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    deadline.current = timeLeft === null ? null : performance.now() + Math.max(0, timeLeft);
    if (timeLeft === null) return;
    const timer = window.setTimeout(() => { audio.current?.pause(); notify.current?.(false); }, Math.max(0, timeLeft));
    return () => window.clearTimeout(timer);
  }, [timeLeft]);

  useEffect(() => {
    active.current = true;
    const player = audio.current;
    if (hasAudio && !expired) void play();
    function visibilityChanged() {
      if (document.hidden) { player?.pause(); notify.current?.(false); }
      else if (hasAudio && !expired && allowed()) void play();
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      active.current = false;
      document.removeEventListener("visibilitychange", visibilityChanged);
      player?.pause(); notify.current?.(false);
    };
  }, [source, hasAudio, expired, play, allowed]);

  return <div className={styles.roundAudio}>
    {teacher && <SongGuessTeacherTimer remainingSeconds={remainingSeconds} roundDurationSeconds={roundDurationSeconds} />}
    {!hasAudio && <p className={styles.playerError} role="alert">음원 파일이 없는 문제예요.</p>}
    {hasAudio && <audio ref={audio} src={source} loop muted={muted} preload="auto" hidden
      aria-label="현재 문제 음원"
      onPlay={() => {
        if (allowed()) notify.current?.(true);
        else audio.current?.pause();
      }}
      onPause={() => notify.current?.(false)}
      onError={() => { if (active.current) { setLoading(false); setError("failed"); } notify.current?.(false); }} />}
    {hasAudio && error && !expired && <div className={styles.audioRecovery}>
      <p className={styles.playerError} role="alert">{error === "blocked" ? "자동 재생이 차단됐어요." : "음원을 재생하지 못했어요."}</p>
      <button type="button" className={controls.secondaryButton} disabled={loading} onClick={() => void play()}>
        {loading ? "불러오는 중…" : error === "blocked" ? "소리 켜기" : "다시 재생"}
      </button>
    </div>}
  </div>;
}
