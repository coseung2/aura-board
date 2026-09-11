"use client";

import { useEffect, useRef, useState } from "react";

type Cue = "tick" | "complete";
const KEY = "aura.student-picker.sound";

export function usePickerSound(open: boolean) {
  const [enabled, setEnabled] = useState(true);
  const enabledRef = useRef(true);
  const openRef = useRef(open);
  openRef.current = open;
  const context = useRef<AudioContext | null>(null);
  const buffers = useRef<Partial<Record<Cue, AudioBuffer>>>({});
  const sources = useRef(new Set<AudioBufferSourceNode>());

  function stop() {
    for (const source of sources.current) {
      try { source.stop(); } catch { /* Already ended. */ }
    }
    sources.current.clear();
  }

  function prepare() {
    if (!enabledRef.current) return;
    try {
      if (!context.current) {
        const Constructor = window.AudioContext || window.webkitAudioContext;
        if (!Constructor) return;
        const audio = new Constructor();
        context.current = audio;
        for (const cue of ["tick", "complete"] as const) {
          void fetch(`/sounds/student-picker/${cue}.ogg`)
            .then((response) => {
              if (!response.ok) throw new Error("Audio unavailable");
              return response.arrayBuffer();
            })
            .then((bytes) => audio.decodeAudioData(bytes))
            .then((buffer) => { if (context.current === audio) buffers.current[cue] = buffer; })
            .catch(() => { /* Sound is optional; never interrupt the draw. */ });
        }
      }
      void context.current.resume().catch(() => {});
    } catch { /* Unsupported or blocked audio. */ }
  }

  function play(cue: Cue) {
    const audio = context.current;
    const buffer = buffers.current[cue];
    if (!openRef.current || !enabledRef.current || document.hidden || !audio || audio.state !== "running" || !buffer) return;
    stop();
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = buffer;
    gain.gain.value = cue === "tick" ? 0.16 : 0.35;
    source.connect(gain);
    gain.connect(audio.destination);
    sources.current.add(source);
    source.onended = () => { sources.current.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  }

  function toggle() {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    try { localStorage.setItem(KEY, String(next)); } catch { /* Storage may be disabled. */ }
    if (next) prepare();
    else stop();
  }

  useEffect(() => {
    try {
      enabledRef.current = localStorage.getItem(KEY) !== "false";
      setEnabled(enabledRef.current);
    } catch { /* Keep default. */ }
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      stop();
      const audio = context.current;
      context.current = null;
      if (audio) void audio.close().catch(() => {});
    };
  }, []);

  useEffect(() => { if (!open) stop(); }, [open]);
  return { enabled, toggle, prepare, play, stop };
}
