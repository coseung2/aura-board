"use client";

import { useState } from "react";

import { visibleEquippedSlimeItemKeys } from "@/lib/pets/item-visibility";
import { formatBpsPercent, slimeBuffBpsForStage } from "@/lib/pets/math";
import {
  SLIME_SHARED_ASSETS,
  type EquippedFloor,
  type SlimeAction,
} from "@/lib/pets/slime-assets";
import type {
  SlimeColor,
  SlimeDefinition,
  SlimeShopItem,
} from "@/lib/pets/types";

import { SlimeCharacterSprite } from "./SlimeCharacterSprite";
import { styles } from "./SlimePetPage.styles";
import {
  calculateGrowthTimeComparison,
  calculateSlimeGrowthPercent,
  EFFECT_LABELS,
  formatGrowthHours,
  SLIME_COOKIE_ITEM_KEY,
  type ClaimedTitle,
  type SlimeGrowthSnapshotPayload,
} from "./SlimePetModel";

const SLIME_TRAMPOLINE_ITEM_KEY = "slime-blue-trampoline";

type SlimeCollectionCardProps = {
  slime: SlimeDefinition;
  representativeColor: SlimeColor | null;
  shopCatalog: readonly SlimeShopItem[];
  ownedItemQuantities: Readonly<Record<string, number>>;
  equippedItemKeys: readonly string[];
  hiddenItemKeys?: readonly string[];
  equippedFloor?: EquippedFloor;
  growth?: SlimeGrowthSnapshotPayload;
  claimedTitles: readonly ClaimedTitle[];
  equippedTitleKey?: string | null;
  growthSpeedBps: number;
  busyRepresentative: SlimeColor | null;
  effectOpen: boolean;
  growthOpen: boolean;
  onToggleEffect: () => void;
  onToggleGrowth: () => void;
  onSetRepresentative: (color: SlimeColor) => void;
  onFeedCookie: (color: SlimeColor) => Promise<boolean>;
  onOpenWardrobe: (color: SlimeColor, trigger: HTMLButtonElement) => void;
};

function floorFromItems(items: readonly SlimeShopItem[]): EquippedFloor {
  let floor: EquippedFloor = "none";
  for (const item of items) {
    if (item.floor) floor = item.floor;
  }
  return floor;
}

function backgroundFromItems(
  items: readonly SlimeShopItem[],
): SlimeShopItem | null {
  let background: SlimeShopItem | null = null;
  for (const item of items) {
    if (item.category === "background" && item.floor === null) {
      background = item;
    }
  }
  return background;
}

function vehicleFromItems(items: readonly SlimeShopItem[]): SlimeShopItem | null {
  let vehicle: SlimeShopItem | null = null;
  for (const item of items) {
    if (item.category === "vehicle" || item.category === "ride") vehicle = item;
  }
  return vehicle;
}
/** One owned pet card: local animation state plus deterministic presentation. */
export function SlimeCollectionCard({
  slime,
  representativeColor,
  shopCatalog,
  ownedItemQuantities,
  equippedItemKeys,
  hiddenItemKeys,
  equippedFloor: _unusedEquippedFloor,
  growth,
  claimedTitles,
  equippedTitleKey,
  growthSpeedBps,
  busyRepresentative,
  effectOpen,
  growthOpen,
  onToggleEffect,
  onToggleGrowth,
  onSetRepresentative,
  onFeedCookie,
  onOpenWardrobe,
}: SlimeCollectionCardProps) {
  void _unusedEquippedFloor;
  const [manualAction, setManualAction] = useState<SlimeAction | null>(null);
  const [cookiePending, setCookiePending] = useState(false);

  const visibleKeys = visibleEquippedSlimeItemKeys(
    equippedItemKeys,
    hiddenItemKeys,
  );
  const assignedItems = visibleKeys
    .map((itemKey) => shopCatalog.find((item) => item.key === itemKey))
    .filter((item): item is SlimeShopItem => Boolean(item));
  const equippedTitle = claimedTitles.find(
    (title) => title.key === equippedTitleKey,
  );
  const stageBuffBps = slimeBuffBpsForStage(slime.baseBuffBps, growth?.stage);
  const equippedBuffItems = equippedItemKeys
    .map((itemKey) => shopCatalog.find((item) => item.key === itemKey))
    .filter((item): item is SlimeShopItem => Boolean(item))
    .filter(
      (item) =>
        Boolean(item.effectKey) &&
        typeof item.effectBps === "number" &&
        item.effectBps > 0,
    );
  const growthPercent = growth ? calculateSlimeGrowthPercent(growth) : null;
  const growthTime = growth
    ? calculateGrowthTimeComparison(growth.remainingSeconds, growthSpeedBps)
    : null;
  // Hidden floors stay equipped for buffs, but the sprite must not keep the
  // persisted equippedFloor once that floor item is visually hidden.
  const floor = floorFromItems(assignedItems);
  const background = backgroundFromItems(assignedItems);
  const vehicle = vehicleFromItems(assignedItems);
  const usesTrampoline = vehicle?.key === SLIME_TRAMPOLINE_ITEM_KEY;
  const renderedFloor: EquippedFloor = usesTrampoline ? "trampoline" : floor;
  const hasScene = Boolean(background || vehicle || renderedFloor !== "none");
  const hasPassiveDrink = assignedItems.some((item) => item.category === "drink");
  const hasInteractiveFloor =
    renderedFloor === "water-puddle" || renderedFloor === "trampoline";
  const passiveAction: SlimeAction = hasPassiveDrink
    ? "drink"
    : hasInteractiveFloor
      ? "floor-interaction"
      : "idle";
  const action = manualAction ?? passiveAction;
  const cookieQuantity = Math.max(
    0,
    Math.floor(ownedItemQuantities[SLIME_COOKIE_ITEM_KEY] ?? 0),
  );
  const effectDetailId = `slime-effect-detail-${slime.color}`;

  const feedCookie = async () => {
    if (cookieQuantity <= 0 || cookiePending || manualAction === "happy") return;
    setCookiePending(true);
    try {
      if (await onFeedCookie(slime.color)) setManualAction("happy");
    } finally {
      setCookiePending(false);
    }
  };

  return (
    <li className={`${styles.slimeItem} ${styles.slimeItemSelected}`}>
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
          className={styles.collectionSprite}
          onComplete={manualAction ? () => setManualAction(null) : undefined}
        />
      </div>
      <div className={styles.itemCopy}>
        {equippedTitle ? (
          <div className={styles.equippedTitleSlot}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={equippedTitle.imagePath}
              alt={`${equippedTitle.label} 칭호`}
              className={styles.equippedTitleImage}
            />
          </div>
        ) : null}
        <div className={styles.nameRow}>
          <div className={styles.nameActionSlot}>
            <button
              type="button"
              className={styles.effectBadge}
              aria-expanded={effectOpen}
              aria-controls={effectDetailId}
              aria-label={`${slime.nameKo} 효과 상세 보기`}
              onClick={onToggleEffect}
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
              className={`${styles.effectPopover} ${effectOpen ? styles.effectPopoverOpen : ""}`}
              role="region"
              aria-label={`${slime.nameKo} 효과 상세`}
              aria-hidden={!effectOpen}
            >
              <strong>활성 효과</strong>
              <div className={styles.effectGroup}>
                <span className={styles.effectGroupLabel}>펫 기본 효과</span>
                <span>
                  {EFFECT_LABELS[slime.effectKey]} +
                  {formatBpsPercent(stageBuffBps)}
                </span>
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
                    {equippedTitle.label} · {EFFECT_LABELS[
                      equippedTitle.effectKey as keyof typeof EFFECT_LABELS
                    ] ?? equippedTitle.effectKey} +
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
              disabled={
                busyRepresentative !== null ||
                representativeColor === slime.color
              }
              onClick={() => onSetRepresentative(slime.color)}
              aria-label={
                representativeColor === slime.color
                  ? `${slime.nameKo} 대표 펫`
                  : `${slime.nameKo}을 대표 펫으로 지정`
              }
              title={
                representativeColor === slime.color ? "대표 펫" : "대표로 지정"
              }
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
            aria-expanded={growthOpen}
            aria-controls={`slime-growth-detail-${slime.color}`}
            aria-label={`${slime.nameKo} 성장 시간 비교 보기`}
            onClick={onToggleGrowth}
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
                className={`${styles.growthPopover} ${growthOpen ? styles.growthPopoverOpen : ""}`}
                role="region"
                aria-label={`${slime.nameKo} 성장 시간 비교`}
              >
                <strong>
                  성장 속도 +{formatBpsPercent(growthSpeedBps)} 적용 중
                </strong>
                <span>
                  버프 없음 {formatGrowthHours(growthTime.withoutBuffSeconds)}
                </span>
                <span>
                  적용 후 {formatGrowthHours(growthTime.withBuffSeconds)}
                </span>
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
          disabled={
            cookieQuantity <= 0 || cookiePending || manualAction === "happy"
          }
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
          <img
            src={SLIME_SHARED_ASSETS.cookie.imageUrl}
            alt=""
            aria-hidden="true"
          />
          <span className={styles.cookieQuantity} aria-hidden="true">
            {cookieQuantity}
          </span>
        </button>
      </div>
    </li>
  );
}
