import { useState } from "react";

import { formatBpsPercent, type calculateCatalogSlimeEffects } from "@/lib/pets/math";
import {
  SLIME_SHARED_ASSETS,
  type EquippedFloor,
  type SlimeAction,
} from "@/lib/pets/slime-assets";
import type { SlimeColor, SlimeDefinition, SlimeShopItem } from "@/lib/pets/types";

import styles from "./SlimePetPage.module.css";
import { SlimeCharacterSprite } from "./SlimeCharacterSprite";
import {
  calculateSlimeGrowthPercent,
  calculateGrowthTimeComparison,
  EFFECT_LABELS,
  formatGrowthHours,
  SLIME_COOKIE_ITEM_KEY,
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
  equippedFloorByColor?: Partial<Record<SlimeColor, EquippedFloor>>;
  growthByColor: Partial<Record<SlimeColor, SlimeGrowthSnapshotPayload>>;
  effects: ReturnType<typeof calculateCatalogSlimeEffects>;
  loading: boolean;
  loadFailed: boolean;
  busyRepresentative: SlimeColor | null;
  onSetRepresentative: (color: SlimeColor) => void;
  onFeedCookie: (color: SlimeColor) => Promise<boolean>;
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
  ownedItemQuantities,
  equippedItemsByColor,
  equippedFloorByColor = {},
  growthByColor,
  effects,
  loading,
  loadFailed,
  busyRepresentative,
  onSetRepresentative,
  onFeedCookie,
  onOpenWardrobe,
}: SlimeCollectionSectionProps) {
  const [actionsByColor, setActionsByColor] = useState<Partial<Record<SlimeColor, SlimeAction>>>({});
  const [pendingCookieByColor, setPendingCookieByColor] = useState<Partial<Record<SlimeColor, boolean>>>({});
  const [openEffectColor, setOpenEffectColor] = useState<SlimeColor | null>(null);
  const [openGrowthColor, setOpenGrowthColor] = useState<SlimeColor | null>(null);
  const accessoryEffects = effects.breakdown.filter((entry) => entry.source !== "slime");
  const growthSpeedBps = effects.totals.growth_speed;

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
          const growthPercent = growth
            ? calculateSlimeGrowthPercent(growth)
            : null;
          const growthTime = growth
            ? calculateGrowthTimeComparison(growth.remainingSeconds, growthSpeedBps)
            : null;
          const floor = normalizeFloor(
            equippedFloorByColor[slime.color],
            floorFromItems(assignedItems),
          );
          const drinkItem = assignedItems.find((item) => item.category === "drink");
          const hasInteractiveFloor = floor === "water-puddle" || floor === "trampoline";
          const hasPassiveDrink = Boolean(drinkItem);
          const passiveAction: SlimeAction = hasInteractiveFloor
            ? "floor-interaction"
            : hasPassiveDrink
              ? "drink"
              : "idle";
          const manualAction = actionsByColor[slime.color];
          const action: SlimeAction = manualAction ?? passiveAction;
          const cookieQuantity = Math.max(
            0,
            Math.floor(ownedItemQuantities[SLIME_COOKIE_ITEM_KEY] ?? 0),
          );
          const cookiePending = pendingCookieByColor[slime.color] === true;
          const clearAction = () => {
            setActionsByColor((current) => {
              if (!(slime.color in current)) return current;
              const next = { ...current };
              delete next[slime.color];
              return next;
            });
          };
          const feedCookie = async () => {
            if (cookieQuantity <= 0 || cookiePending || manualAction === "happy") return;
            setPendingCookieByColor((current) => ({ ...current, [slime.color]: true }));
            try {
              const consumed = await onFeedCookie(slime.color);
              if (consumed) {
                setActionsByColor((current) => ({ ...current, [slime.color]: "happy" }));
              }
            } finally {
              setPendingCookieByColor((current) => {
                const next = { ...current };
                delete next[slime.color];
                return next;
              });
            }
          };
          const effectDetailId = `slime-effect-detail-${slime.color}`;
          return (
            <li key={slime.key} className={`${styles.slimeItem} ${styles.slimeItemSelected}`}>
              <div className={styles.effectDetail}>
                <button
                  type="button"
                  className={styles.effectBadge}
                  aria-expanded={openEffectColor === slime.color}
                  aria-controls={effectDetailId}
                  aria-label={`${slime.nameKo} 효과 상세 보기`}
                  onClick={() => setOpenEffectColor((current) =>
                    current === slime.color ? null : slime.color,
                  )}
                >
                  <img
                    className={styles.effectArrowIcon}
                    src="/creatures/slimes/ui/growth-buff-arrow.png"
                    alt=""
                    aria-hidden="true"
                  />
                  <span className={styles.visuallyHidden}>
                    {EFFECT_LABELS[slime.effectKey]} +{formatBpsPercent(slime.baseBuffBps)}
                  </span>
                </button>
                <div
                  id={effectDetailId}
                  className={`${styles.effectPopover} ${openEffectColor === slime.color ? styles.effectPopoverOpen : ""}`}
                  role="region"
                  aria-label={`${slime.nameKo} 효과 상세`}
                  aria-hidden={openEffectColor !== slime.color}
                >
                  <strong>활성 효과</strong>
                  <div className={styles.effectGroup}>
                    <span className={styles.effectGroupLabel}>펫 기본 효과</span>
                    <span>{EFFECT_LABELS[slime.effectKey]} +{formatBpsPercent(slime.baseBuffBps)}</span>
                  </div>
                  {accessoryEffects.length > 0 ? (
                    <div className={styles.effectGroup}>
                      <span className={styles.effectGroupLabel}>소품 추가 효과</span>
                      <ul className={styles.effectItemList}>
                        {accessoryEffects.map((entry) => (
                          <li key={`${entry.source}:${entry.key}`}>
                            {entry.label} · {EFFECT_LABELS[entry.effectKey]} +{formatBpsPercent(entry.bps)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
              <span className={styles.ownedChip}>
                {representativeColor === slime.color ? "대표" : "보유 중"}
              </span>
              <div className={styles.spriteFrame}>
                <SlimeCharacterSprite
                  slime={slime}
                  items={assignedItems}
                  growthStage={growth?.stage ?? 1}
                  action={action}
                  repeat={!manualAction && hasPassiveDrink}
                  equippedFloor={floor}
                  onComplete={manualAction
                    ? clearAction
                    : hasInteractiveFloor || hasPassiveDrink
                      ? undefined
                      : () => {
                          setActionsByColor((current) => {
                            if (!(slime.color in current)) return current;
                            const next = { ...current };
                            delete next[slime.color];
                            return next;
                          });
                        }}
                />
              </div>
              <div className={styles.itemCopy}>
                <h3>{slime.nameKo}</h3>
                {growth && growthPercent !== null ? (
                  <button
                    type="button"
                    className={styles.growthSummary}
                    data-testid={`slime-growth-${slime.color}`}
                    aria-expanded={openGrowthColor === slime.color}
                    aria-controls={`slime-growth-detail-${slime.color}`}
                    aria-label={`${slime.nameKo} 성장 시간 비교 보기`}
                    onClick={() => setOpenGrowthColor((current) =>
                      current === slime.color ? null : slime.color,
                    )}
                  >
                    <div className={styles.growthMeta}>
                      <span>성장 {growth.stage}단계</span>
                      <strong>{growthPercent}%</strong>
                    </div>
                    <div
                      className={styles.growthTrack}
                      role="progressbar"
                      aria-label={`${slime.nameKo} 성장 ${growth.stage}단계 진행도 ${growthPercent}%`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={growthPercent}
                      aria-valuetext={`${growth.stage}단계 ${growthPercent}%`}
                    >
                      <span
                        className={styles.growthFill}
                        style={{ width: `${growthPercent}%` }}
                      />
                    </div>
                    {growthTime && growth.remainingSeconds > 0 ? (
                      <span
                        id={`slime-growth-detail-${slime.color}`}
                        className={`${styles.growthPopover} ${openGrowthColor === slime.color ? styles.growthPopoverOpen : ""}`}
                        role="region"
                        aria-label={`${slime.nameKo} 성장 시간 비교`}
                      >
                        <strong>성장 속도 +{formatBpsPercent(growthSpeedBps)} 적용 중</strong>
                        <span>버프 없음 {formatGrowthHours(growthTime.withoutBuffSeconds)}</span>
                        <span>적용 후 {formatGrowthHours(growthTime.withBuffSeconds)}</span>
                      </span>
                    ) : null}
                  </button>
                ) : null}
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
                    disabled={cookieQuantity <= 0 || cookiePending || manualAction === "happy"}
                    onClick={() => void feedCookie()}
                    aria-label={
                      cookieQuantity > 0
                        ? `${slime.nameKo}에게 쿠키 주기 (보유 ${cookieQuantity}개)`
                        : `${slime.nameKo}에게 쿠키 주기 (쿠키 없음)`
                    }
                    title="쿠키 주기"
                    data-testid={`slime-cookie-feed-${slime.color}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={SLIME_SHARED_ASSETS.cookie.imageUrl} alt="" aria-hidden="true" />
                    {cookieQuantity > 0 ? (
                      <span className={styles.cookieQuantity} aria-hidden="true">
                        {cookieQuantity}
                      </span>
                    ) : null}
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
  const baseEffects = effects.breakdown.filter((entry) => entry.source === "slime");
  const accessoryEffects = effects.breakdown.filter((entry) => entry.source !== "slime");
  return (
    <section className={styles.section} aria-labelledby="slime-breakdown-title">
      <div className={styles.breakdownHeading}>
        <h2 id="slime-breakdown-title">효과 내역</h2>
      </div>
      <ul className={styles.breakdown} aria-live="polite">
        {effects.breakdown.length === 0 ? (
          <li>슬라임을 장착하면 개별 버프가 표시돼요.</li>
        ) : (
          <>
            {baseEffects.length > 0 ? (
              <li className={styles.breakdownGroup}>
                <strong className={styles.breakdownGroupLabel}>펫 기본 효과</strong>
                <ul className={styles.breakdownGroupList}>
                  {baseEffects.map((entry) => (
                    <li key={`${entry.source}:${entry.key}`}>
                      <span className={styles.breakdownEffectLabel}>
                        <span>{entry.label}</span>
                      </span>
                      <span>{EFFECT_LABELS[entry.effectKey]} +{formatBpsPercent(entry.bps)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ) : null}
            {accessoryEffects.length > 0 ? (
              <li className={styles.breakdownGroup}>
                <strong className={styles.breakdownGroupLabel}>소품 추가 효과</strong>
                <ul className={styles.breakdownGroupList}>
                  {accessoryEffects.map((entry) => (
                    <li key={`${entry.source}:${entry.key}`}>
                      <span className={styles.breakdownEffectLabel}>
                        <span>{entry.label}</span>
                      </span>
                      <span>{EFFECT_LABELS[entry.effectKey]} +{formatBpsPercent(entry.bps)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ) : null}
          </>
        )}
      </ul>
    </section>
  );
}
