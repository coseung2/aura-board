"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./CreatureHub.module.css";

export type CreatureSpriteStage = "egg" | "hatchling" | "juvenile" | "evolved";
export type CreatureSpriteBehavior = "normal" | "lazy" | "signature";

export const CREATURE_FRAME_COUNT = 3;

const CREATURE_FRAME_DELAYS: Record<CreatureSpriteBehavior, number> = {
  normal: 880,
  lazy: 1_450,
  signature: 640,
};

type Props = {
  lineKey: string;
  stage: CreatureSpriteStage;
  behavior: CreatureSpriteBehavior;
  affinity?: string | null;
  name: string;
  className?: string;
  roaming?: boolean;
};

const AFFINITY_GLYPHS: Record<string, string> = {
  earth: "✦",
  river: "◌",
  sea: "◒",
  volcano: "▲",
  sky: "☁",
  darkness: "☾",
  light: "✧",
};

const STAGE_LABELS: Record<CreatureSpriteStage, string> = {
  egg: "알",
  hatchling: "부화",
  juvenile: "성장",
  evolved: "진화",
};

export function creatureFrameNumber(frameIndex: number): number {
  if (!Number.isFinite(frameIndex)) return 1;

  const normalized = Math.trunc(frameIndex) % CREATURE_FRAME_COUNT;
  return (normalized < 0 ? normalized + CREATURE_FRAME_COUNT : normalized) + 1;
}

export function creatureFramePath(
  lineKey: string,
  stage: CreatureSpriteStage,
  behavior: CreatureSpriteBehavior,
  frameIndex: number,
): string | null {
  if (!lineKey) return null;

  const frame = creatureFrameNumber(frameIndex).toString().padStart(2, "0");
  return `/creatures/${lineKey}/${stage}/frames/${behavior}/${behavior}-${frame}.png`;
}

export function creatureFramePaths(
  lineKey: string,
  stage: CreatureSpriteStage,
  behavior: CreatureSpriteBehavior,
): string[] {
  return Array.from({ length: CREATURE_FRAME_COUNT }, (_, frameIndex) =>
    creatureFramePath(lineKey, stage, behavior, frameIndex),
  ).filter((path): path is string => Boolean(path));
}

export function creatureFrameDelay(behavior: CreatureSpriteBehavior): number {
  return CREATURE_FRAME_DELAYS[behavior];
}

function useReducedMotionPreference(): boolean | null {
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      setReducedMotion(false);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updatePreference);
      return () => mediaQuery.removeEventListener("change", updatePreference);
    }

    mediaQuery.addListener(updatePreference);
    return () => mediaQuery.removeListener(updatePreference);
  }, []);

  return reducedMotion;
}

type AnimatedSpriteProps = Omit<Props, "lineKey"> & {
  frameSources: string[];
};

function SpriteFallback({ affinity, name, stage, className = "" }: Pick<Props, "affinity" | "name" | "stage" | "className">) {
  return (
    <div
      className={`${styles.spriteFallback} ${className}`.trim()}
      role="img"
      aria-label={`${name} ${STAGE_LABELS[stage]} 단계 미리보기`}
    >
      <span aria-hidden="true">{AFFINITY_GLYPHS[affinity ?? ""] ?? "✦"}</span>
    </div>
  );
}

function AnimatedCreatureSprite({
  frameSources,
  affinity,
  name,
  stage,
  behavior,
  className = "",
  roaming = false,
}: AnimatedSpriteProps) {
  const reducedMotion = useReducedMotionPreference();
  const [frameIndex, setFrameIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [framesReady, setFramesReady] = useState(false);
  const renderedFrameIndex = reducedMotion === true ? 0 : frameIndex;
  const source = frameSources[renderedFrameIndex] ?? frameSources[0];
  const motionClass = roaming && reducedMotion === false ? styles.spriteRoaming : "";

  useEffect(() => {
    if (reducedMotion !== false || failed || frameSources.length !== CREATURE_FRAME_COUNT) {
      setFramesReady(false);
      return;
    }

    if (typeof window.Image !== "function") {
      setFramesReady(true);
      return;
    }

    let disposed = false;
    const preloadedImages: HTMLImageElement[] = [];
    const preloadResults = frameSources.map(
      (frameSource) =>
        new Promise<boolean>((resolve) => {
          const image = new window.Image();
          preloadedImages.push(image);
          image.onload = () => resolve(true);
          image.onerror = () => {
            if (!disposed) setFailed(true);
            resolve(false);
          };
          image.src = frameSource;
        }),
    );

    void Promise.all(preloadResults).then((results) => {
      if (disposed) return;
      if (results.every(Boolean)) {
        setFramesReady(true);
      } else {
        setFailed(true);
      }
    });

    return () => {
      disposed = true;
      preloadedImages.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
    };
  }, [failed, frameSources, reducedMotion]);

  useEffect(() => {
    if (reducedMotion !== false || failed || !framesReady) return;

    const timeoutId = window.setTimeout(() => {
      setFrameIndex((current) => (current + 1) % CREATURE_FRAME_COUNT);
    }, creatureFrameDelay(behavior));

    return () => window.clearTimeout(timeoutId);
  }, [behavior, failed, frameIndex, framesReady, reducedMotion]);

  if (failed || !source) {
    return <SpriteFallback affinity={affinity} name={name} stage={stage} className={`${className} ${motionClass}`.trim()} />;
  }

  return (
    <div className={`${styles.spriteFrame} ${className} ${motionClass}`.trim()}>
      {/* These local sprite assets intentionally use a raw img: next/image
          cannot optimize the packed frame sheets and the source is same-origin. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={source}
        alt={`${name} ${STAGE_LABELS[stage]} 단계 모습`}
        className={styles.spriteImage}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/**
 * Try the catalog line's packed frame first. Lines whose art package has not
 * landed yet use a deliberate affinity tile, so a missing image never leaves
 * a broken-image glyph in the hub.
 */
export function CreatureSprite({
  lineKey,
  stage,
  behavior,
  affinity,
  name,
  className = "",
  roaming = false,
}: Props) {
  const frameSources = useMemo(
    () => creatureFramePaths(lineKey, stage, behavior),
    [behavior, lineKey, stage],
  );

  if (frameSources.length !== CREATURE_FRAME_COUNT) {
    return <SpriteFallback affinity={affinity} name={name} stage={stage} className={className} />;
  }

  return (
    <AnimatedCreatureSprite
      key={`${lineKey}:${stage}:${behavior}`}
      stage={stage}
      behavior={behavior}
      affinity={affinity}
      name={name}
      className={className}
      roaming={roaming}
      frameSources={frameSources}
    />
  );
}
