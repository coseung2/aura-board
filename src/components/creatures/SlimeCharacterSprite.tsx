"use client";

import { useId } from "react";
import type { SlimeDefinition, SlimeShopItem } from "@/lib/pets/types";
import styles from "./SlimeCharacterSprite.module.css";

const HUE_ANGLES = { green: 275, yellow: 205, purple: 70, red: 155 } as const;
const GROWTH_CROWN_PATHS = {
  2: "/creatures/slimes/growth/stage-2-crown.png",
  3: "/creatures/slimes/growth/stage-3-crown.png",
} as const;

export type SlimeGrowthStage = 1 | 2 | 3;

export function SlimeCharacterSprite({
  slime,
  items = [],
  growthStage = 1,
}: {
  slime: SlimeDefinition;
  items?: SlimeShopItem[];
  /** Persisted server stage; callers may use stage one while loading. */
  growthStage?: SlimeGrowthStage;
}) {
  const rawId = useId();
  const filterId = `slime-${rawId.replace(/:/g, "")}-${slime.color}`;
  const backgrounds = items.filter((item) => item.category === "background");
  const characterItem = items.find((item) => item.category !== "background");
  const angle = slime.color === "blue" ? null : HUE_ANGLES[slime.color];
  const itemLabels = items.map((item) => item.labelKo).join(", ");
  const shouldRecolorCharacter = Boolean(characterItem) && angle !== null;
  const growthCrownPath = growthStage >= 3 ? GROWTH_CROWN_PATHS[3] : growthStage >= 2 ? GROWTH_CROWN_PATHS[2] : null;

  return (
    <div className={styles.frame}>
      {shouldRecolorCharacter ? (
        <svg className={styles.filterDefinition} aria-hidden="true" focusable="false">
          <defs>
            <filter id={filterId} colorInterpolationFilters="sRGB">
              <feColorMatrix in="SourceGraphic" type="hueRotate" values={String(angle)} result="rotated" />
              <feColorMatrix
                in="SourceGraphic"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.8 -0.2 1 0 0"
                result="blueMask"
              />
              <feComposite in="rotated" in2="blueMask" operator="in" result="recoloredSlime" />
              <feComposite in="SourceGraphic" in2="blueMask" operator="out" result="untouchedItem" />
              <feMerge>
                <feMergeNode in="untouchedItem" />
                <feMergeNode in="recoloredSlime" />
              </feMerge>
            </filter>
          </defs>
        </svg>
      ) : null}
      {backgrounds.map((item) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={item.key} className={styles.background} src={item.spritePath} alt="" aria-hidden="true" />
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.character}
        src={characterItem?.spritePath ?? slime.spritePath}
        data-slime-color={characterItem ? slime.color : undefined}
        style={shouldRecolorCharacter ? { filter: `url(#${filterId})` } : undefined}
        alt={items.length > 0 ? `${slime.nameKo}, ${itemLabels} 적용 미리보기` : `${slime.nameKo} 미리보기`}
      />
      {growthCrownPath ? (
        // Full positioning can be finalized in Aseprite/CSS after the crown layers are cut out.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.growthCrown} src={growthCrownPath} alt="" aria-hidden="true" />
      ) : null}
    </div>
  );
}
