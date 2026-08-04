import { Text, StyleSheet, View } from "react-native";

import { ControlPressable } from "../ui";
import { SlimeSprite } from "./SlimeSprite";
import { SlimeBuffTierChip } from "./SlimeBuffTierChip";
import {
  isSceneBackgroundItem,
  selectSceneBackgroundSpritePath,
  slimeShopPreviewColor,
  SLIME_COOKIE_ITEM_KEY,
  type SlimeCatalogItem,
  type SlimeShopItem,
} from "../../lib/slimes";
import type { SlimeColor } from "../../lib/slime-assets";
import {
  isVehicleSlimeShopItem,
  slimeShopItemBuffLabel,
  slimeShopItemPreview,
  slimeShopItemSpritePath,
} from "../../lib/slime-shop-presentation";
import {
  borders,
  colors,
  iconSizes,
  radii,
  slimeUi,
  spacing,
  typography,
} from "../../theme/tokens";

type SlimeShopItemCardProps = {
  item: SlimeShopItem;
  selectedColor: SlimeColor;
  unitLabel: string;
  ownedItemKeys: readonly string[];
  ownedItemQuantities: Readonly<Record<string, number>>;
  busyItemKey: string | null;
  onPress: (item: SlimeShopItem) => void;
};

/** Native catalog item card shared by overview and category/tier lists. */
export function SlimeShopItemCard({
  item,
  selectedColor,
  unitLabel,
  ownedItemKeys,
  ownedItemQuantities,
  busyItemKey,
  onPress,
}: SlimeShopItemCardProps) {
  const quantity = ownedItemQuantities[item.key] ?? 0;
  const repeatable = item.key === SLIME_COOKIE_ITEM_KEY;
  const owned = repeatable ? quantity > 0 : ownedItemKeys.includes(item.key);
  const busy = busyItemKey === item.key;
  const buffLabel = slimeShopItemBuffLabel(item);
  const preview = slimeShopItemPreview(item);
  const sceneBackground = isSceneBackgroundItem(item);
  const expandedScene =
    isVehicleSlimeShopItem(item) ||
    sceneBackground ||
    preview.equippedFloor !== "none";
  const itemSummary = repeatable
    ? `${quantity}개 보유`
    : !owned
      ? `${item.price.toLocaleString()}${unitLabel}`
      : null;

  return (
    <ControlPressable
      style={[styles.card, styles.sceneCard]}
      disabled={busyItemKey !== null || (owned && !repeatable)}
      onPress={() => onPress(item)}
      accessibilityLabel={`${item.labelKo} ${repeatable && quantity > 0 ? `${quantity}개 보유, 구매` : owned ? "보유 중" : "구매"}`}
      accessibilityState={{
        disabled: busyItemKey !== null || (owned && !repeatable),
        busy,
      }}
    >
      <View
        style={[
          styles.preview,
          styles.previewFullBleed,
          expandedScene && styles.previewSceneSlot,
          sceneBackground && styles.previewScene,
        ]}
        accessible={false}
      >
        <SlimeSprite
          slimeColor={slimeShopPreviewColor(item, selectedColor)}
          evolution="base"
          action={preview.action}
          equippedFloor={preview.equippedFloor}
          displayScale={slimeUi.petSceneDisplayScale}
          repeat={Boolean(preview.propAction)}
          expandSceneSurfaces={preview.expandSceneSurfaces || sceneBackground}
          itemSpritePath={
            sceneBackground ? undefined : slimeShopItemSpritePath(item)
          }
          propAction={preview.propAction}
          backgroundSpritePath={
            sceneBackground ? selectSceneBackgroundSpritePath(item) : undefined
          }
          wearables={preview.wearables}
          drinkFlavor={preview.drinkFlavor}
          vehicleSpritePath={
            preview.vehicle?.vehicleSheetPath ?? preview.vehicle?.spritePath
          }
          vehicleGroundedSpritePath={preview.vehicle?.vehicleGroundedSpritePath}
          vehicleEffectSpritePaths={preview.vehicle?.vehicleEffectSpritePaths}
          vehicleFrameCount={preview.vehicle?.vehicleFrameCount}
          vehicleGroundedFrameCount={preview.vehicle?.vehicleGroundedFrameCount}
          vehicleGroundedFrameDurationMs={
            preview.vehicle?.vehicleGroundedFrameDurationMs
          }
          vehicleCanvasHeight={preview.vehicle?.vehicleCanvasHeight}
          vehicleCharacterOffsetY={preview.vehicle?.vehicleCharacterOffsetY}
          vehicleBobY={preview.vehicle?.vehicleBobY}
          vehicleRiseY={preview.vehicle?.vehicleRiseY}
          vehicleOffsetX={preview.vehicle?.vehicleOffsetX}
          accessibilityLabel={`${item.labelKo} 미리보기`}
        />
        {buffLabel ? (
          <SlimeBuffTierChip label={buffLabel} bps={item.effectBps ?? 0} />
        ) : null}
      </View>
      <View style={[styles.cardBody, styles.shopCardBody]}>
        <View style={styles.copy}>
          <Text style={styles.title}>{item.labelKo}</Text>
          {itemSummary ? <Text style={styles.subtitle}>{itemSummary}</Text> : null}
        </View>
        <Text
          style={[
            styles.status,
            (repeatable || !owned) && styles.statusBuy,
          ]}
        >
          {busy ? "처리 중…" : repeatable ? "구매" : owned ? "보유 중" : "구매"}
        </Text>
      </View>
    </ControlPressable>
  );
}

type SlimeCharacterCatalogCardProps = {
  slime: SlimeCatalogItem;
  unitLabel: string;
  ownedColors: readonly SlimeColor[];
  busyColor: SlimeColor | null;
  onPress: (slime: SlimeCatalogItem) => void;
};

/** Native character catalog card shared by overview and character tab. */
export function SlimeCharacterCatalogCard({
  slime,
  unitLabel,
  ownedColors,
  busyColor,
  onPress,
}: SlimeCharacterCatalogCardProps) {
  const owned = ownedColors.includes(slime.color);
  const busy = busyColor === slime.color;
  return (
    <ControlPressable
      style={[styles.card, styles.sceneCard]}
      disabled={owned || busyColor !== null}
      onPress={() => onPress(slime)}
      accessibilityLabel={`${slime.nameKo} ${owned ? "보유 중" : "구매"}`}
      accessibilityState={{ disabled: owned || busyColor !== null, busy }}
    >
      <View style={[styles.preview, styles.previewFullBleed]} accessible={false}>
        <SlimeSprite
          slimeColor={slime.color}
          evolution="base"
          action="idle"
          equippedFloor="none"
          displayScale={slimeUi.petSceneDisplayScale}
          accessibilityLabel={`${slime.nameKo} 미리보기`}
        />
        <SlimeBuffTierChip
          label={`기본 효과 +${slime.baseBuffBps / 100}%`}
          bps={slime.baseBuffBps}
        />
      </View>
      <View style={[styles.cardBody, styles.shopCardBody]}>
        <View style={styles.copy}>
          <Text style={styles.title}>{slime.nameKo}</Text>
        </View>
        <Text style={[styles.status, !owned && styles.statusBuy]}>
          {busy
            ? "구매 중…"
            : owned
              ? "보유 중"
              : `${slime.price.toLocaleString()}${unitLabel}`}
        </Text>
      </View>
    </ControlPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "31.5%",
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: spacing.xxs,
  },
  sceneCard: {
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.none,
    gap: spacing.none,
    overflow: "hidden",
  },
  preview: {
    width: iconSizes.empty,
    height: iconSizes.empty,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  previewFullBleed: { width: "100%", height: iconSizes.empty },
  previewSceneSlot: {
    position: "relative",
    width: "100%",
    height: iconSizes.empty + spacing.xxl,
    overflow: "hidden",
  },
  previewScene: { backgroundColor: colors.transparent },
  cardBody: { width: "100%", gap: spacing.xs },
  shopCardBody: {
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.xxs,
  },
  copy: { width: "100%", minWidth: 0, alignItems: "center", gap: spacing.xxs },
  title: { ...typography.label, color: colors.text, textAlign: "center" },
  subtitle: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
  status: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
  statusBuy: { color: colors.accent },
});
