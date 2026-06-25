"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClockIcon, CloseIcon } from "./icons/UiIcons";

const PRESET_MINUTES = [1, 3, 5, 10, 15];
const MIN_MINUTES = 1;
const MAX_MINUTES = 180;

function clampMinutes(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(value)));
}

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function playTimerChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.8);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.85);
    window.setTimeout(() => void context.close(), 1000);
  } catch {
    // Browsers can block audio in some contexts; the visual finished state is enough.
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export function BoardTimerFab() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const [remainingSeconds, setRemainingSeconds] = useState(5 * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const endAtRef = useRef<number | null>(null);

  const durationSeconds = useMemo(() => minutes * 60, [minutes]);
  const timerLabel = finished ? "종료" : running ? "진행 중" : "대기";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!running) return;

    const intervalId = window.setInterval(() => {
      if (!endAtRef.current) return;
      const nextRemaining = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setRemainingSeconds(nextRemaining);

      if (nextRemaining === 0) {
        endAtRef.current = null;
        setRunning(false);
        setFinished(true);
        playTimerChime();
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [running]);

  const setDuration = (nextMinutes: number) => {
    const safeMinutes = clampMinutes(nextMinutes);
    endAtRef.current = null;
    setMinutes(safeMinutes);
    setRemainingSeconds(safeMinutes * 60);
    setRunning(false);
    setFinished(false);
  };

  const startTimer = () => {
    const secondsToRun = remainingSeconds > 0 ? remainingSeconds : durationSeconds;
    setRemainingSeconds(secondsToRun);
    endAtRef.current = Date.now() + secondsToRun * 1000;
    setRunning(true);
    setFinished(false);
  };

  const pauseTimer = () => {
    if (endAtRef.current) {
      setRemainingSeconds(Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000)));
    }
    endAtRef.current = null;
    setRunning(false);
  };

  const resetTimer = () => {
    endAtRef.current = null;
    setRemainingSeconds(durationSeconds);
    setRunning(false);
    setFinished(false);
  };

  const panel = (
    <section
      className={`board-timer-panel${finished ? " is-finished" : ""}`}
      role="dialog"
      aria-label="타이머"
    >
      <div className="board-timer-header">
        <div>
          <p className="board-timer-kicker">타이머</p>
          <strong className="board-timer-status">{timerLabel}</strong>
        </div>
        <button
          type="button"
          className="board-timer-close"
          onClick={() => setOpen(false)}
          aria-label="타이머 닫기"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <output className="board-timer-display" aria-live="polite">
        {formatTimer(remainingSeconds)}
      </output>

      <div className="board-timer-presets" aria-label="타이머 빠른 설정">
        {PRESET_MINUTES.map((preset) => (
          <button
            key={preset}
            type="button"
            className={preset === minutes ? "is-selected" : ""}
            onClick={() => setDuration(preset)}
          >
            {preset}분
          </button>
        ))}
      </div>

      <label className="board-timer-input">
        <span>시간</span>
        <input
          type="number"
          min={MIN_MINUTES}
          max={MAX_MINUTES}
          value={minutes}
          onChange={(event) => setDuration(Number(event.target.value))}
        />
        <span>분</span>
      </label>

      <div className="board-timer-actions">
        {running ? (
          <button type="button" className="board-timer-primary" onClick={pauseTimer}>
            일시정지
          </button>
        ) : (
          <button type="button" className="board-timer-primary" onClick={startTimer}>
            시작
          </button>
        )}
        <button type="button" className="board-timer-secondary" onClick={resetTimer}>
          초기화
        </button>
      </div>
    </section>
  );

  return (
    <>
      <button
        type="button"
        className={`board-timer-fab${running ? " is-running" : ""}${finished ? " is-finished" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label="타이머"
        aria-pressed={open}
      >
        <ClockIcon size={24} />
      </button>
      {mounted && open ? createPortal(panel, document.body) : null}
    </>
  );
}
