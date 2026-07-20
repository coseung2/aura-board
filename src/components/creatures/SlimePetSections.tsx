import { useState } from "react";

import { formatBpsPercent, type calculateCatalogSlimeEffects } from "@/lib/pets/math";
import { formatSlimeGrowthRemaining } from "@/lib/pets/growth";
import {
  SLIME_SHARED_ASSETS,
  type EquippedFloor,
  type SlimeAction,
} from "@/lib/pets/slime-assets";
import type { SlimeColor, SlimeDefinition, SlimeShopItem } from "@/lib/pets/types";

import styles from "./SlimePetPage.module.css";
import { SlimeCharacterSprite } from "./SlimeCharacterSprite";
import {
  EFFECT_LABELS,
  type EquippedItemsByColor,
  type SlimeGrowthSnapshotPayload,
} from "./SlimePetModel";

type SlimeCollectionSectionProps = {
  catalog: SlimeDefinition[];
  ownedKeys: SlimeColor[];
  representativeColor: SlimeColor | null;
  shopCatalog: SlimeShopItem[];
  equippedItemsByColor: EquippedItemsByColor;
  equippedFloorByColor?: Partial<Record<SlimeColor, EquippedFloor>>;
  growthByColor: Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>;
  loading: boolean;
  loadFailed: boolean;
  busyRepresentative: SlimeColor | null;
  onSetRepresentative: (color: SlimeColor) => void;
  onOpenWardrobe: (color: SlimeColor, trigger: HTMLButtonElement) => void;
};

function floorFromItems(items: readonly SlimeShopItem[]): EquippedFloor {
  let floor: EquippedFloor = "none";
  for (const item of items) {
    const candidate = item.floor;
    if (
      candidate === "grass-floor" ||
      candidate === "water-puddle" ||
      candidate === "trampoline"
    ) {
      floor = candidate;
    }
  }
  return floor;
}

function normalizeFloor(value: unknown, fallback: EquippedFloor): EquippedFloor {
  return value === "grass-floor" || value === "water-puddle" || value === "trampoline"
    ? value
    : value === "none"
      ? "none"
      : fallback;
}

export function SlimeCollectionSection({
  catalog,
  ownedKeys,
  representativeColor,
  shopCatalog,
  equippedItemsByColor,
  equippedFloorByColor = {},
  growthByColor,
  loading,
  loadFailed,
  busyRepresentative,
  onSetRepresentative,
  onOpenWardrobe,
}: SlimeCollectionSectionProps) {
  const [actionsByColor, setActionsByColor] = useState<Partial<Record<SlimeColor, SlimeAction>>>({});

  return (
    <section className={styles.section} aria-labelledby="slime-selection-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="slime-selection-title">펫 선택</h2>
          <p>장착한 펫의 버프가 해당 활동에 적용돼요.</p>
        </div>
        <span className={styles.count}>
          {ownedKeys.length} / {catalog.length} 보유
        </span>
      </div>

      <ul className={styles.slimeGrid} aria-label="슬라임 목록" aria-busy={loading}>
        {loading ? (
          <li className={styles.emptyState}>슬라임 목록을 준비하고 있어요…</li>
        ) : loadFailed ? (
          <li className={styles.emptyState}>슬라임 목록을 불러오지 못했어요.</li>
        ) : catalog.length === 0 ? (
          <li className={styles.emptyState}>표시할 슬라임이 없어요.</li>
        ) : catalog.map((slime) => {
          const owned = ownedKeys.includes(slime.key);
          if (!owned) {
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
          const assignedItems = (equippedItemsByColor[slime.color] ?? [])
            .map((itemKey) => shopCatalog.find((item) => item.key === itemKey))
            .filter((item): item is SlimeShopItem => Boolean(item));
          const growth = growthByColor[slime.color];
          const floor = normalizeFloor(
            equippedFloorByColor[slime.color],
            floorFromItems(assignedItems),
          );
          const drinkItem = assignedItems.find((item) => item.category === "drink");
          const hasInteractiveFloor = floor === "water-puddle" || floor === "trampoline";
          const hasPassiveDrink = Boolean(drinkItem);
          const action: SlimeAction = hasInteractiveFloor
            ? "floor-interaction"
            : hasPassiveDrink
              ? "drink"
              : actionsByColor[slime.color] ?? "idle";
          const setAction = (nextAction: SlimeAction) => {
            setActionsByColor((current) => ({ ...current, [slime.color]: nextAction }));
          };
          return (
            <li key={slime.key} className={`${styles.slimeItem} ${styles.slimeItemSelected}`}>
              <span className={styles.ownedChip}>
                {representativeColor === slime.color ? "대표" : "보유 중"}
              </span>
              <div className={styles.spriteFrame}>
                <SlimeCharacterSprite
                  slime={slime}
                  items={assignedItems}
                  growthStage={growth?.stage ?? 1}
                  action={action}
                  repeat={hasPassiveDrink}
                  equippedFloor={floor}
                  onComplete={hasInteractiveFloor || hasPassiveDrink ? undefined : () => {
                    setActionsByColor((current) =>
                      current[slime.color] === action
                        ? { ...current, [slime.color]: "idle" }
                        : current,
                    );
                  }}
                />
              </div>
              <div className={styles.itemCopy}>
                <h3>{slime.nameKo}</h3>
                <p>{EFFECT_LABELS[slime.effectKey]} +{formatBpsPercent(slime.baseBuffBps)}</p>
                {growth ? (
                  <p className={styles.growthSummary} data-testid={`slime-growth-${slime.color}`}>
                    성장 {growth.stage}단계 · {formatSlimeGrowthRemaining(growth.remainingSeconds)}
                  </p>
                ) : null}
                <p className={styles.equipmentSummary} aria-live="polite">
                  {assignedItems.length > 0
                    ? `장착: ${assignedItems.map((item) => item.labelKo).join(", ")}`
                    : "장착한 아이템 없음"}
                </p>
              </div>
              <div className={styles.slimeActions}>
                <div
                  className={styles.slimeActionButtons}
                  role="group"
                  aria-label={`${slime.nameKo} 행동`}
                >
                  <button
                    type="button"
                    className={styles.slimeActionButton}
                    disabled={action !== "idle"}
                    onClick={() => setAction("happy")}
                    aria-label={`${slime.nameKo}에게 쿠키 주기`}
                    title="쿠키 주기"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={SLIME_SHARED_ASSETS.cookie.imageUrl} alt="" aria-hidden="true" />
                  </button>
                </div>
                {representativeColor !== slime.color ? (
                  <button
                    type="button"
                    className={styles.representativeButton}
                    disabled={busyRepresentative !== null}
                    onClick={() => onSetRepresentative(slime.color)}
                  >
                    {busyRepresentative === slime.color ? "지정 중…" : "대표로 지정"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.wardrobeButton}
                  onClick={(event) => onOpenWardrobe(slime.color, event.currentTarget)}
                  aria-label={`${slime.nameKo} 꾸미기`}
                >
                  꾸미기
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type SlimeEffectsSectionProps = {
  effects: ReturnType<typeof calculateCatalogSlimeEffects>;
};

export function SlimeEffectsSection({ effects }: SlimeEffectsSectionProps) {
  return (
    <section className={styles.section} aria-labelledby="slime-breakdown-title">
      <div className={styles.breakdownHeading}>
        <h2 id="slime-breakdown-title">효과 내역</h2>
      </div>
      <ul className={styles.breakdown} aria-live="polite">
        {effects.breakdown.length === 0 ? (
          <li>슬라임을 장착하면 개별 버프가 표시돼요.</li>
        ) : effects.breakdown.map((entry) => (
          <li key={`${entry.source}:${entry.key}`}>
            <span>{entry.label}</span>
            <span>{EFFECT_LABELS[entry.effectKey]} +{formatBpsPercent(entry.bps)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
