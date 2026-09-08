"use client";

import { useEffect, useRef, useState } from "react";
import type { GroupEditorDraft, GroupEditorStudent } from "./GroupRosterEditor";
import styles from "./SeatingReveal.module.css";

type Props = {
  groups: GroupEditorDraft[];
  students: GroupEditorStudent[];
  onComplete: () => void;
  onProgress?: (revealed: number, shuffling: boolean) => void;
  muted?: boolean;
};

export function SeatingReveal({ groups, onComplete, onProgress, muted = false }: Props) {
  const [step, setStep] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const done = useRef(false);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const total = groups.reduce((sum, group) => sum + group.studentIds.length, 0);
  const revealed = Math.max(0, step - 3);
  const finished = revealed >= total;
  useEffect(() => { onProgress?.(revealed, step === 3); }, [revealed, step, onProgress]);

  function finish() {
    if (done.current) return;
    done.current = true;
    complete.current();
  }

  useEffect(() => {
    const opener = document.activeElement;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    setAudioReady(true);
    return () => {
      media.removeEventListener("change", update);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (finished) {
      const timer = setTimeout(() => { if (!done.current) { done.current = true; complete.current(); } }, 650);
      return () => clearTimeout(timer);
    }
    const delay = step < 3 ? 400 : step === 3 ? 600 : Math.max(80, Math.min(220, 5000 / Math.max(total, 1)));
    const timer = setTimeout(() => setStep(current => current + 1), delay);
    return () => clearTimeout(timer);
  }, [step, total, finished]);

  useEffect(() => {
    if (muted || !audioReady) return;
    const source = finished ? "/sounds/song-guess/podium.ogg" : step < 3
      ? "/sounds/song-guess/countdown.ogg" : step === 3
        ? "/sounds/seating/shuffle.ogg" : "/sounds/song-guess/join.ogg";
    const sound = new Audio(source);
    sound.volume = step === 3 ? 0.45 : 0.3;
    void sound.play().catch(() => {});
    return () => { sound.pause(); sound.removeAttribute("src"); sound.load(); };
  }, [step, muted, finished, audioReady]);

  const title = finished ? "새로운 자리가 정해졌어요!" : step < 3 ? "내 자리는 어디일까요?" : step === 3 ? "자리를 섞고 있어요" : "새로운 친구, 새로운 자리";
  return (
    <>
      {step < 3 && <span className={styles.countdown} aria-live="polite">{3 - step}</span>}
      <span className={styles.srOnly} role="status">{title}</span>
    </>
  );
}
