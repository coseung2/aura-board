"use client";

import { useEffect, useRef, useState } from "react";

type SlimeSpritePlaybackOptions = {
  playbackKey: string;
  frameCount: number;
  durationForFrame: (frameIndex: number) => number;
  loops: boolean;
  oneShot: boolean;
  repeat: boolean;
  onComplete?: () => void;
};

/** JSON-duration sprite playback with one-shot completion de-duplication. */
export function useSlimeSpritePlayback({
  playbackKey,
  frameCount,
  durationForFrame,
  loops,
  oneShot,
  repeat,
  onComplete,
}: SlimeSpritePlaybackOptions): number {
  const [frameIndex, setFrameIndex] = useState(0);
  const completedPlaybackRef = useRef<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  const durationForFrameRef = useRef(durationForFrame);
  onCompleteRef.current = onComplete;
  durationForFrameRef.current = durationForFrame;

  useEffect(() => {
    setFrameIndex(0);
    completedPlaybackRef.current = null;
  }, [playbackKey]);

  useEffect(() => {
    const currentDurationMs = durationForFrameRef.current(frameIndex);
    const timeoutId = window.setTimeout(() => {
      const isLastFrame = frameIndex >= frameCount - 1;
      if (oneShot && !repeat && isLastFrame) {
        if (completedPlaybackRef.current !== playbackKey) {
          completedPlaybackRef.current = playbackKey;
          onCompleteRef.current?.();
        }
        return;
      }

      setFrameIndex((current) => {
        if (loops || repeat) return (current + 1) % frameCount;
        return Math.min(current + 1, frameCount - 1);
      });
    }, Math.max(0, currentDurationMs));

    return () => window.clearTimeout(timeoutId);
  }, [
    frameCount,
    frameIndex,
    loops,
    oneShot,
    playbackKey,
    repeat,
  ]);

  return frameIndex;
}

type GroundedVehiclePlaybackOptions = {
  enabled: boolean;
  frameCount: number;
  frameDurationMs: number;
};

/** Constant-rate grounded vehicle layer playback, independent from rider bob. */
export function useGroundedVehiclePlayback({
  enabled,
  frameCount,
  frameDurationMs,
}: GroundedVehiclePlaybackOptions): number {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!enabled || frameCount <= 1) {
      setFrameIndex(0);
      return;
    }
    const period = Math.max(16, Math.trunc(frameDurationMs));
    const timer = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frameCount);
    }, period);
    return () => window.clearInterval(timer);
  }, [enabled, frameCount, frameDurationMs]);

  return frameIndex;
}
