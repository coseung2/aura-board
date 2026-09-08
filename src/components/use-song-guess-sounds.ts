"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSongGuessSoundController, type SongGuessSoundController } from "@/lib/song-guess/sounds";
import type { SongGuessGuessResult, SongGuessSnapshot } from "@/lib/song-guess/contracts";

export function useSongGuessSounds(snapshot: SongGuessSnapshot, result: SongGuessGuessResult | null, remainingSeconds: number | null) {
  const controller = useRef<SongGuessSoundController | null>(null);
  const musicPlaying = useRef(false);
  const [muted, setMuted] = useState(false);
  const previousPhase = useRef(snapshot.phase);
  const joinedCount = snapshot.participants.filter((participant) => participant.joined !== false).length;
  const previousJoined = useRef(joinedCount);
  const lastResult = useRef<SongGuessGuessResult | null>(result);

  useEffect(() => {
    const sounds = createSongGuessSoundController();
    controller.current = sounds;
    setMuted(sounds.isMuted());
    return () => { sounds.dispose(); controller.current = null; };
  }, []);

  const unlock = useCallback(() => { void controller.current?.unlock(); }, []);
  const toggleMuted = useCallback(() => {
    const next = !controller.current?.isMuted();
    controller.current?.setMuted(next);
    setMuted(next);
    if (!next) {
      const sounds = controller.current;
      void Promise.resolve(sounds?.unlock()).then((unlocked) => { if (unlocked) void sounds?.play("join"); });
    }
  }, []);
  const onMusicPlaying = useCallback((playing: boolean) => {
    musicPlaying.current = playing;
    if (playing) controller.current?.stop();
  }, []);

  useEffect(() => {
    if (previousPhase.current === snapshot.phase) return;
    previousPhase.current = snapshot.phase;
    musicPlaying.current = false;
    const cue = snapshot.phase === "guessing" ? "start" : snapshot.phase === "reveal" ? "round-results" : snapshot.phase === "finished" ? "podium" : null;
    if (cue) void controller.current?.play(cue);
    else controller.current?.stop();
  }, [snapshot.phase]);

  useEffect(() => {
    if (joinedCount > previousJoined.current && snapshot.phase === "lobby") void controller.current?.play("join");
    previousJoined.current = joinedCount;
  }, [joinedCount, snapshot.phase]);

  useEffect(() => {
    if (!result || result === lastResult.current) return;
    lastResult.current = result;
    if (result.roundId !== snapshot.currentRound.roundId || result.alreadyScored || musicPlaying.current) return;
    void controller.current?.play(result.correct ? "correct" : "wrong");
  }, [result, snapshot.currentRound.roundId]);

  useEffect(() => {
    if (snapshot.phase === "guessing" && remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= 3 && !musicPlaying.current) {
      void controller.current?.play("countdown");
    }
  }, [remainingSeconds, snapshot.phase]);

  return { muted, unlock, toggleMuted, onMusicPlaying };
}
