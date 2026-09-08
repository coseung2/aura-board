"use client";

import { useEffect, useRef, useState } from "react";
import { Music2, Pause, Play, RotateCcw } from "lucide-react";
import type { SongGuessClipSnapshot } from "@/lib/song-guess/contracts";
import { songGuessClipUrl } from "@/lib/song-guess/browser-client";
import styles from "./SongGuessGame.module.css";

export function SongGuessPlayer({ sessionId, clip, onPlayingChange }: {
  sessionId: string;
  clip: SongGuessClipSnapshot;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const active = useRef(true);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [played, setPlayed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAudio = clip.mimeType.startsWith("audio/");

  useEffect(() => {
    active.current = true;
    const media = audio.current;
    function stopWhenHidden() {
      if (!document.hidden) return;
      media?.pause();
      setPlaying(false);
      setLoading(false);
      onPlayingChange?.(false);
    }
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      active.current = false;
      document.removeEventListener("visibilitychange", stopWhenHidden);
      media?.pause();
      onPlayingChange?.(false);
    };
  }, [onPlayingChange]);

  async function play() {
    const player = audio.current;
    if (!player || document.hidden) return;
    if (!player.paused) { player.pause(); return; }
    setError(null);
    setLoading(true);
    onPlayingChange?.(true);
    try {
      if (player.error) player.load();
      if (player.ended) player.currentTime = 0;
      await player.play();
      if (!active.current || document.hidden) { player.pause(); return; }
      setPlayed(true);
    } catch {
      onPlayingChange?.(false);
      if (active.current && !document.hidden) setError("음악을 재생하지 못했어요. 다시 시도해 주세요.");
    } finally {
      if (active.current) setLoading(false);
    }
  }

  return <div className={styles.player}>
    {hasAudio ? <>
      <button type="button" className={styles.playButton} onClick={() => void play()} disabled={loading}
        aria-label={playing ? "음악 일시정지" : played ? "음악 다시 재생" : "음악 재생"} aria-pressed={playing}>
        {playing ? <Pause size={40} aria-hidden="true" /> : played ? <RotateCcw size={36} aria-hidden="true" /> : <Play size={40} aria-hidden="true" />}
      </button>
      <span className={styles.clipLabel}><Music2 size={16} aria-hidden="true" />{loading ? "불러오는 중…" : `${clip.tierMs / 1000}초 듣기`}</span>
      <audio ref={audio} preload="none" src={songGuessClipUrl(sessionId, clip.assetId)} aria-label={`${clip.tierMs / 1000}초 음악 클립`}
        onPlay={() => { setPlaying(true); onPlayingChange?.(true); }}
        onPause={() => { setPlaying(false); onPlayingChange?.(false); }}
        onEnded={() => { setPlaying(false); onPlayingChange?.(false); }}
        onError={() => { setPlaying(false); setLoading(false); onPlayingChange?.(false); setError("음악을 불러오지 못했어요. 다시 시도해 주세요."); }} />
    </> : <p className={styles.playerError} role="alert">음원 파일이 없는 문제예요.</p>}
    {error && <p className={styles.playerError} role="alert">{error}</p>}
  </div>;
}
