import { useState } from "react";

import { formatBpsPercent, slimeBuffBpsForStage, type calculateCatalogSlimeEffects } from "@/lib/pets/math";
import {
  EQUIPPED_FLOORS,
  SLIME_SHARED_ASSETS,
  type EquippedFloor,
  type SlimeAction,
} from "@/lib/pets/slime-assets";
import type { SlimeColor, SlimeDefinition, SlimeShopItem } from "@/lib/pets/types";

import styles from "./SlimePetPage.module.css";
import { SlimeCharacterSprite } from "./SlimeCharacterSprite";
import { visibleEquippedSlimeItemKeys } from "@/lib/pets/item-visibility";
import {
  calculateSlimeGrowthPercent,
  calculateGrowthTimeComparison,
  EFFECT_LABELS,
  formatGrowthHours,
  SLIME_COOKIE_ITEM_KEY,
  type EquippedItemsByColor,
  type SlimeGrowthSnapshotPayload,
} from "./SlimePetModel";
import type { ClaimedTitle } from "./SlimePetPage";

const SLIME_TRAMPOLINE_ITEM_KEY = "slime-blue-trampoline";

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

function floorFromItems(items: readonly SlimeShopItem[]): EquippedFloor {
  let floor: EquippedFloor = "none";
  for (const item of items) {
    const candidate = item.floor;
    if (candidate) floor = candidate;
  }
  return floor;
}

function backgroundFromItems(items: readonly SlimeShopItem[]): SlimeShopItem | null {
  let background: SlimeShopItem | null = null;
  for (const item of items) {
    if (item.category === "background" && item.floor === null) {
      background = item;
    }
  }
  return background;
}

/**
 * Equipped vehicle, if any. Last matching key wins so a legacy row carrying more
 * than one vehicle still resolves deterministically.
 */
function vehicleFromItems(items: readonly SlimeShopItem[]): SlimeShopItem | null {
  let vehicle: SlimeShopItem | null = null;
  for (const item of items) {
    if (item.category === "vehicle" || item.category === "ride") vehicle = item;
  }
  return vehicle;
}

function normalizeFloor(value: unknown, fallback: EquippedFloor): EquippedFloor {
  return typeof value === "string"
    && (EQUIPPED_FLOORS as readonly string[]).includes(value)
    ? value as EquippedFloor
    : fallback;
}

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
  const [actionsByColor, setActionsByColor] = useState<Partial<Record<SlimeColor, SlimeAction>>>({});
  const [pendingCookieByColor, setPendingCookieByColor] = useState<Partial<Record<SlimeColor, boolean>>>({});
  const [openEffectColor, setOpenEffectColor] = useState<SlimeColor | null>(null);
  const [openGrowthColor, setOpenGrowthColor] = useState<SlimeColor | null>(null);
  const growthSpeedBps = effects.totals.growth_speed;

  return (
    <section className={`${styles.section} ${styles.collectionSection}`}>
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
          const equippedKeys = equippedItemsByColor[slime.color] ?? [];
          const visibleKeys = visibleEquippedSlimeItemKeys(
            equippedKeys,
            hiddenItemsByColor[slime.color],
          );
          // Buff/set math keeps full equipped keys; only the sprite uses visibleKeys.
          const assignedItems = visibleKeys
            .map((itemKey) => shopCatalog.find((item) => item.key === itemKey))
            .filter((item): item is SlimeShopItem => Boolean(item));
          const growth = growthByColor[slime.color];
          const equippedTitleKey = equippedTitleByColor[slime.color] ?? null;
          const equippedTitle = claimedTitles.find((title) => title.key === equippedTitleKey);
          const stageBuffBps = slimeBuffBpsForStage(slime.baseBuffBps, growth?.stage);
          // Buff popovers are pet-local: only this pet's base, equipped items, and title.
          // Hidden items still contribute buffs even when the sprite omits them.
          const equippedBuffItems = equippedKeys
            .map((itemKey) => shopCatalog.find((item) => item.key === itemKey))
            .filter((item): item is SlimeShopItem => Boolean(item))
            .filter(
              (item) =>
                Boolean(item.effectKey) &&
                typeof item.effectBps === "number" &&
                item.effectBps > 0,
            );
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
          const background = backgroundFromItems(assignedItems);
          const vehicle = vehicleFromItems(assignedItems);
          const usesTrampoline = vehicle?.key === SLIME_TRAMPOLINE_ITEM_KEY;
          const renderedFloor: EquippedFloor = usesTrampoline ? "trampoline" : floor;
          const hasScene = Boolean(background || vehicle || renderedFloor !== "none");
          const drinkItem = assignedItems.find((item) => item.category === "drink");
          const hasInteractiveFloor =
            renderedFloor === "water-puddle" || renderedFloor === "trampoline";
          const hasPassiveDrink = Boolean(drinkItem);
          const passiveAction: SlimeAction = hasPassiveDrink
            ? "drink"
            : hasInteractiveFloor
              ? "floor-interaction"
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
              <div
                className={`${styles.spriteFrame} ${hasScene ? styles.spriteFrameScene : ""} ${background ? styles.spriteFrameSceneBackground : ""}`.trim()}
              >
                <SlimeCharacterSprite
                    slime={slime}
                    items={assignedItems}
                    growthStage={growth?.stage ?? 1}
                    action={action}
                    repeat={!manualAction && hasPassiveDrink}
                    equippedFloor={floor}
                    scale={2}
                    hostBackground={Boolean(background)}
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
                {equippedTitle ? (
                  <span className={styles.equippedTitle}>{equippedTitle.label}</span>
                ) : null}
                <div className={styles.nameRow}>
                  <div className={styles.nameActionSlot}>
                    <button
                      type="button"
                      className={styles.effectBadge}
                      aria-expanded={openEffectColor === slime.color}
                      aria-controls={effectDetailId}
                      aria-label={`${slime.nameKo} 효과 상세 보기`}
                      onClick={() => {
                        setOpenGrowthColor(null);
                        setOpenEffectColor((current) =>
                          current === slime.color ? null : slime.color,
                        );
                      }}
                    >
                      <img
                        className={styles.effectArrowIcon}
                        src="/creatures/slimes/ui/growth-buff-arrow.png"
                        alt=""
                        aria-hidden="true"
                      />
                      <span className={styles.visuallyHidden}>
                        {EFFECT_LABELS[slime.effectKey]} +{formatBpsPercent(stageBuffBps)}
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
                        <span>{EFFECT_LABELS[slime.effectKey]} +{formatBpsPercent(stageBuffBps)}</span>
                      </div>
                      {equippedBuffItems.length > 0 ? (
                        <div className={styles.effectGroup}>
                          <span className={styles.effectGroupLabel}>소품 추가 효과</span>
                          <ul className={styles.effectItemList}>
                            {equippedBuffItems.map((item) => (
                              <li key={item.key}>
                                {item.labelKo} · {EFFECT_LABELS[item.effectKey!]} +
                                {formatBpsPercent(item.effectBps ?? 0)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {equippedTitle && equippedTitle.buffBps > 0 ? (
                        <div className={styles.effectGroup}>
                          <span className={styles.effectGroupLabel}>칭호 효과</span>
                          <span>
                            {equippedTitle.label} · {EFFECT_LABELS[equippedTitle.effectKey as keyof typeof EFFECT_LABELS] ?? equippedTitle.effectKey} +
                            {formatBpsPercent(equippedTitle.buffBps)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <h3 className={styles.petName}>{slime.nameKo}</h3>
                  <div className={styles.nameActionSlot}>
                    <button
                      type="button"
                      className={`${styles.representativeStar} ${representativeColor === slime.color ? styles.representativeStarSelected : ""}`}
                      disabled={busyRepresentative !== null || representativeColor === slime.color}
                      onClick={() => onSetRepresentative(slime.color)}
                      aria-label={representativeColor === slime.color ? `${slime.nameKo} 대표 펫` : `${slime.nameKo}을 대표 펫으로 지정`}
                      title={representativeColor === slime.color ? "대표 펫" : "대표로 지정"}
                    >
                      <span aria-hidden="true">★</span>
                    </button>
                  </div>
                </div>
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
<div
                className={styles.slimeActions}
                role="group"
                aria-label={`${slime.nameKo} 펫 관리`}
              >
                <button
                  type="button"
                  className={styles.wardrobeButton}
                  onClick={(event) => onOpenWardrobe(slime.color, event.currentTarget)}
                  aria-label={`${slime.nameKo} 꾸미기`}
                >
                  꾸미기
                </button>
                <button
                  type="button"
                  className={`${styles.slimeActionButton} ${cookieQuantity <= 0 ? styles.slimeActionButtonDisabled : ""}`.trim()}
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
                  <span className={styles.cookieQuantity} aria-hidden="true">
                    {cookieQuantity}
                  </span>
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
    <section className={styles.appliedEffects} aria-labelledby="slime-applied-buffs-title">
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
