"use client";

import { useState } from "react";

import { formatBpsPercent, type calculateCatalogSlimeEffects } from "@/lib/pets/math";
import type { EquippedFloor } from "@/lib/pets/slime-assets";
import type {
  SlimeColor,
  SlimeDefinition,
  SlimeShopItem,
} from "@/lib/pets/types";

import { SlimeCollectionCard } from "./SlimeCollectionCard";
import { styles } from "./SlimePetPage.styles";
import {
  EFFECT_LABELS,
  type ClaimedTitle,
  type EquippedItemsByColor,
  type SlimeGrowthSnapshotPayload,
} from "./SlimePetModel";

type SlimeCollectionSectionProps = {
  catalog: SlimeDefinition[];
  ownedKeys: SlimeColor[];
  representativeColor: SlimeColor | null;
  shopCatalog: SlimeShopItem[];
  ownedItemQuantities: Record<string, number>;
  equippedItemsByColor: EquippedItemsByColor;
  hiddenItemsByColor?: Partial<Record<SlimeColor, string[]>>;
  equippedFloorByColor?: Partial<Record<SlimeColor, EquippedFloor>>;
  growthByColor: Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>;
  claimedTitles: ClaimedTitle[];
  equippedTitleByColor: Partial<Record<SlimeColor, string>>;
  effects: ReturnType<typeof calculateCatalogSlimeEffects>;
  loading: boolean;
  loadFailed: boolean;
  busyRepresentative: SlimeColor | null;
  onSetRepresentative: (color: SlimeColor) => void;
  onFeedCookie: (color: SlimeColor) => Promise<boolean>;
  onOpenWardrobe: (color: SlimeColor, trigger: HTMLButtonElement) => void;
};

/** Owns collection-level empty states and the single-open-popover contract. */
export function SlimeCollectionSection({
  catalog,
  ownedKeys,
  representativeColor,
  shopCatalog,
  ownedItemQuantities,
  equippedItemsByColor,
  hiddenItemsByColor = {},
  equippedFloorByColor = {},
  growthByColor,
  claimedTitles,
  equippedTitleByColor,
  effects,
  loading,
  loadFailed,
  busyRepresentative,
  onSetRepresentative,
  onFeedCookie,
  onOpenWardrobe,
}: SlimeCollectionSectionProps) {
  const [openEffectColor, setOpenEffectColor] =
    useState<SlimeColor | null>(null);
  const [openGrowthColor, setOpenGrowthColor] =
    useState<SlimeColor | null>(null);
  const growthSpeedBps = effects.totals.growth_speed;

  return (
    <section className={`${styles.section} ${styles.collectionSection}`}>
      <ul
        className={styles.slimeGrid}
        aria-label="슬라임 목록"
        aria-busy={loading}
      >
        {loading ? (
          <li className={styles.emptyState}>슬라임 목록을 준비하고 있어요…</li>
        ) : loadFailed ? (
          <li className={styles.emptyState}>슬라임 목록을 불러오지 못했어요.</li>
        ) : catalog.length === 0 ? (
          <li className={styles.emptyState}>표시할 슬라임이 없어요.</li>
        ) : (
          catalog.map((slime) => {
            if (!ownedKeys.includes(slime.key)) {
              return (
                <li
                  key={slime.key}
                  className={`${styles.slimeItem} ${styles.slimePlaceholder}`}
                  aria-label="빈 슬라임 자리"
                >
                  <div className={styles.placeholderSprite} aria-hidden="true" />
                  <span className={styles.placeholderLabel}>비어 있음</span>
                </li>
              );
            }

            return (
              <SlimeCollectionCard
                key={slime.key}
                slime={slime}
                representativeColor={representativeColor}
                shopCatalog={shopCatalog}
                ownedItemQuantities={ownedItemQuantities}
                equippedItemKeys={equippedItemsByColor[slime.color] ?? []}
                hiddenItemKeys={hiddenItemsByColor[slime.color]}
                equippedFloor={equippedFloorByColor[slime.color]}
                growth={growthByColor[slime.color]}
                claimedTitles={claimedTitles}
                equippedTitleKey={equippedTitleByColor[slime.color]}
                growthSpeedBps={growthSpeedBps}
                busyRepresentative={busyRepresentative}
                effectOpen={openEffectColor === slime.color}
                growthOpen={openGrowthColor === slime.color}
                onToggleEffect={() => {
                  setOpenGrowthColor(null);
                  setOpenEffectColor((current) =>
                    current === slime.color ? null : slime.color,
                  );
                }}
                onToggleGrowth={() =>
                  setOpenGrowthColor((current) =>
                    current === slime.color ? null : slime.color,
                  )
                }
                onSetRepresentative={onSetRepresentative}
                onFeedCookie={onFeedCookie}
                onOpenWardrobe={onOpenWardrobe}
              />
            );
          })
        )}
      </ul>
    </section>
  );
}

type SlimeEffectsSectionProps = {
  effects: ReturnType<typeof calculateCatalogSlimeEffects>;
};

const EFFECT_DESCRIPTIONS: Record<string, string> = {
  growth_speed: "펫의 성장 속도가 UP!",
  reading_reward: "독서로 얻을 수 있는 보상이 UP!",
  walking_reward: "걷기로 얻을 수 있는 보상이 UP!",
  assignment_reward: "과제 제출 날짜를 지켰을 때의 보상이 UP!",
  comment_reward: "게시물에 댓글을 남겼을 때의 보상이 UP!",
};

export function SlimeEffectsSection({ effects }: SlimeEffectsSectionProps) {
  const applied = (Object.entries(effects.totals) as Array<
    [keyof typeof effects.totals, number]
  >)
    .filter(([, bps]) => bps > 0)
    .map(([effectKey, bps]) => ({ effectKey, bps }));

  return (
    <section
      className={styles.appliedEffects}
      aria-labelledby="slime-applied-buffs-title"
    >
      <div className={styles.breakdownHeading}>
        <h2 id="slime-applied-buffs-title">적용 중인 버프</h2>
      </div>
      {applied.length === 0 ? (
        <p className={styles.appliedEffectsEmpty} aria-live="polite">
          현재 적용 중인 버프가 없어요.
        </p>
      ) : (
        <ul className={styles.appliedEffectsList} aria-live="polite">
          {applied.map((effect) => (
            <li key={effect.effectKey} className={styles.appliedEffectRow}>
              <span className={styles.appliedEffectLabel}>
                {EFFECT_LABELS[effect.effectKey]}
              </span>
              <span className={styles.appliedEffectDescription}>
                {EFFECT_DESCRIPTIONS[effect.effectKey] ?? ""}
              </span>
              <strong className={styles.appliedEffectValue}>
                +{formatBpsPercent(effect.bps)}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
