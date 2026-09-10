"use client";

import { useEffect, useRef, useState } from "react";
import { Music2, Pause, Play, RotateCcw } from "lucide-react";
import type { SongGuessClipSnapshot } from "@/lib/song-guess/contracts";
import { songGuessClipUrl } from "@/lib/song-guess/browser-client";
import styles from "./SongGuessGame.module.css";
import teacherStyles from "./SongGuessTeacher.module.css";

const WAVE_HEIGHTS = [
  18, 34, 24, 40, 28, 14, 31, 20, 37, 26, 42, 30, 19, 36, 25, 41, 29, 16,
  33, 22, 38, 27, 43, 31, 20, 35, 24, 39, 28, 15, 32, 21, 37, 26, 41, 29,
];

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function SongGuessPlayer({
  sessionId,
  clip,
  onPlayingChange,
  teacher = false,
  remainingSeconds = null,
  roundDurationSeconds = 30,
}: {
  sessionId: string;
  clip: SongGuessClipSnapshot;
  onPlayingChange?: (playing: boolean) => void;
  teacher?: boolean;
  remainingSeconds?: number | null;
  roundDurationSeconds?: number;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const active = useRef(true);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [played, setPlayed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const hasAudio = clip.mimeType.startsWith("audio/");
  const clipDurationSeconds = Math.max(1, clip.tierMs / 1000);
  const audioProgress = Math.max(0, Math.min(1, currentTime / clipDurationSeconds));
  const timerProgress = Math.max(
    0,
    Math.min(1, (remainingSeconds ?? 0) / Math.max(1, roundDurationSeconds)),
  );

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
    if (!player.paused) {
      player.pause();
      return;
    }
    setError(null);
    setLoading(true);
    onPlayingChange?.(true);
    try {
      if (player.error) player.load();
      if (player.ended) player.currentTime = 0;
      await player.play();
      if (!active.current || document.hidden) {
        player.pause();
        return;
      }
      setPlayed(true);
    } catch {
      onPlayingChange?.(false);
      if (active.current && !document.hidden) {
        setError("음악을 재생하지 못했어요. 다시 시도해 주세요.");
      }
    } finally {
      if (active.current) setLoading(false);
    }
  }

  const media = hasAudio ? (
    <audio
      ref={audio}
      preload="none"
      src={songGuessClipUrl(sessionId, clip.assetId)}
      aria-label={`${clip.tierMs / 1000}초 음악 클립`}
      onPlay={() => {
        setPlaying(true);
        onPlayingChange?.(true);
      }}
      onPause={() => {
        setPlaying(false);
        onPlayingChange?.(false);
      }}
      onEnded={() => {
        setPlaying(false);
        setCurrentTime(clipDurationSeconds);
        onPlayingChange?.(false);
      }}
      onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      onError={() => {
        setPlaying(false);
        setLoading(false);
        onPlayingChange?.(false);
        setError("음악을 불러오지 못했어요. 다시 시도해 주세요.");
      }}
    />
  ) : null;

  if (teacher) {
    if (!hasAudio) {
      return <p className={styles.playerError}>음원 파일이 없는 문제예요.</p>;
    }
    return (
      <div className={teacherStyles.teacherPlayer}>
        <button
          type="button"
          className={teacherStyles.recordButton}
          onClick={() => void play()}
          disabled={loading}
          aria-label={playing ? "음악 일시정지" : played ? "음악 다시 재생" : "음악 재생"}
          aria-pressed={playing}
        >
          <span className={teacherStyles.recordIcon} aria-hidden="true">
            {playing ? <Pause size={34} /> : played ? <RotateCcw size={31} /> : <Play size={34} />}
          </span>
        </button>

        <div className={teacherStyles.teacherPlayerInfo}>
          <span className={teacherStyles.nowPlaying}>NOW PLAYING</span>
          <h3 className={teacherStyles.playerTitle}>오디오 재생</h3>
          <div className={teacherStyles.waveform} aria-hidden="true">
            {WAVE_HEIGHTS.map((height, index) => (
              <span
                key={`${height}-${index}`}
                className={teacherStyles.waveBar}
                data-active={index / WAVE_HEIGHTS.length <= audioProgress}
                style={{ height }}
              />
            ))}
          </div>
          <div className={teacherStyles.playerControls}>
            <button
              type="button"
              className={teacherStyles.playerControlButton}
              onClick={() => void play()}
              disabled={loading}
              aria-label={playing ? "일시정지" : "재생"}
            >
              {playing ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
            </button>
            <div>
              <span className={teacherStyles.playerTime}>
                {formatTime(currentTime)} / {formatTime(clipDurationSeconds)}
              </span>
              <span className={teacherStyles.playerMeta}>
                {loading ? "불러오는 중…" : `${clip.tierMs / 1000}초 클립`}
              </span>
            </div>
          </div>
          {error && (
            <p className={styles.playerError} role="alert">
              {error}
            </p>
          )}
        </div>

        <div className={teacherStyles.timerBox} role="timer" aria-label="남은 응답 시간">
          <span>남은 시간</span>
          <strong className={teacherStyles.timerNumber}>
            {remainingSeconds === null ? "—" : Math.max(0, remainingSeconds)}
          </strong>
          <span className={teacherStyles.timerUnit}>초</span>
          <div className={teacherStyles.timerTrack} aria-hidden="true">
            <div className={teacherStyles.timerFill} style={{ width: `${timerProgress * 100}%` }} />
          </div>
        </div>
        {media}
      </div>
    );
  }

  return (
    <div className={styles.player}>
      {hasAudio ? (
        <>
          <button
            type="button"
            className={styles.playButton}
            onClick={() => void play()}
            disabled={loading}
            aria-label={playing ? "음악 일시정지" : played ? "음악 다시 재생" : "음악 재생"}
            aria-pressed={playing}
          >
            {playing ? (
              <Pause size={40} aria-hidden="true" />
            ) : played ? (
              <RotateCcw size={36} aria-hidden="true" />
            ) : (
              <Play size={40} aria-hidden="true" />
            )}
          </button>
          <span className={styles.clipLabel}>
            <Music2 size={16} aria-hidden="true" />
            {loading ? "불러오는 중…" : `${clip.tierMs / 1000}초 듣기`}
          </span>
          {media}
        </>
      ) : (
        <p className={styles.playerError} role="alert">
          음원 파일이 없는 문제예요.
        </p>
      )}
      {error && (
        <p className={styles.playerError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
