import { Ban } from "lucide-react-native";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

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
  slimeShopItemBuffLabel,
  slimeShopItemPreview,
  slimeShopItemSpritePath,
} from "../../lib/slime-shop-presentation";
import { slimeShopBallPreviewImagePath } from "../../lib/slime-shop-preview-performance";
import {
  borders,
  colors,
  iconSizes,
  layers,
  radii,
  slimeUi,
  spacing,
  states,
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
  const cardWidth = useShopCardWidth();
  const quantity = Math.max(0, ownedItemQuantities[item.key] ?? 0);
  const repeatable = item.key === SLIME_COOKIE_ITEM_KEY;
  const owned = repeatable ? quantity > 0 : ownedItemKeys.includes(item.key);
  const busy = busyItemKey === item.key;
  const buffLabel = slimeShopItemBuffLabel(item);
  const preview = slimeShopItemPreview(item);
  const sceneBackground = isSceneBackgroundItem(item);
  const ballPreviewImagePath = slimeShopBallPreviewImagePath(item);
  const itemSpritePath = sceneBackground
    ? undefined
    : ballPreviewImagePath ?? slimeShopItemSpritePath(item);
  const unavailable = owned && !repeatable;
  const priceLabel = `${item.price.toLocaleString()}${unitLabel}`;

  return (
    <ControlPressable
      style={[styles.card, { width: cardWidth }]}
      disabled={busyItemKey !== null || unavailable}
      onPress={() => onPress(item)}
      accessibilityLabel={`${item.labelKo} ${
        repeatable && quantity > 0
          ? `${quantity}개 보유, 구매`
          : unavailable
            ? "보유 중"
            : `${priceLabel}, 구매`
      }`}
      accessibilityState={{
        disabled: busyItemKey !== null || unavailable,
        busy,
      }}
    >
      <View
        style={[
          styles.preview,
          sceneBackground && styles.previewScene,
          unavailable && styles.contentMuted,
        ]}
        accessible={false}
      >
        <SlimeSprite
          slimeColor={slimeShopPreviewColor(item, selectedColor)}
          evolution="base"
          action={preview.action}
          equippedFloor={preview.equippedFloor}
          displayScale={slimeUi.shopCardSceneDisplayScale}
          repeat={Boolean(preview.propAction) && !ballPreviewImagePath}
          animate={!ballPreviewImagePath}
          expandSceneSurfaces={preview.expandSceneSurfaces || sceneBackground}
          itemSpritePath={itemSpritePath}
          propAction={ballPreviewImagePath ? undefined : preview.propAction}
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
      <View style={[styles.cardBody, unavailable && styles.contentMuted]}>
        <Text style={styles.title} numberOfLines={2}>
          {item.labelKo}
        </Text>
        <Text style={styles.price}>{priceLabel}</Text>
        {repeatable && quantity > 0 ? (
          <Text style={styles.detail}>{quantity}개 보유</Text>
        ) : null}
        {busy ? <Text style={styles.detail}>처리 중…</Text> : null}
      </View>
      {unavailable ? <OwnedOverlay /> : null}
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
  const cardWidth = useShopCardWidth();
  const owned = ownedColors.includes(slime.color);
  const busy = busyColor === slime.color;
  const priceLabel = `${slime.price.toLocaleString()}${unitLabel}`;

  return (
    <ControlPressable
      style={[styles.card, { width: cardWidth }]}
      disabled={owned || busyColor !== null}
      onPress={() => onPress(slime)}
      accessibilityLabel={`${slime.nameKo} ${owned ? "보유 중" : `${priceLabel}, 구매`}`}
      accessibilityState={{ disabled: owned || busyColor !== null, busy }}
    >
      <View
        style={[styles.preview, owned && styles.contentMuted]}
        accessible={false}
      >
        <SlimeSprite
          slimeColor={slime.color}
          evolution="base"
          action="idle"
          equippedFloor="none"
          displayScale={slimeUi.shopCardSceneDisplayScale}
          accessibilityLabel={`${slime.nameKo} 미리보기`}
        />
        <SlimeBuffTierChip
          label={`기본 효과 +${slime.baseBuffBps / 100}%`}
          bps={slime.baseBuffBps}
        />
      </View>
      <View style={[styles.cardBody, owned && styles.contentMuted]}>
        <Text style={styles.title} numberOfLines={2}>
          {slime.nameKo}
        </Text>
        <Text style={styles.price}>{busy ? "구매 중…" : priceLabel}</Text>
      </View>
      {owned ? <OwnedOverlay /> : null}
    </ControlPressable>
  );
}

function OwnedOverlay() {
  return (
    <View style={styles.ownedOverlay} pointerEvents="none" accessible={false}>
      <Ban size={iconSizes.md} color={colors.danger} strokeWidth={2.25} />
      <Text style={styles.ownedOverlayText}>보유 중</Text>
    </View>
  );
}

function useShopCardWidth(): "47.8%" | "31.5%" {
  const { width } = useWindowDimensions();
  return width >= 700 ? "31.5%" : "47.8%";
}

const styles = StyleSheet.create({
  card: {
    position: "relative",
    minWidth: 0,
    paddingHorizontal: spacing.none,
    paddingVertical: spacing.none,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: spacing.sm,
    overflow: "visible",
    opacity: states.visibleOpacity,
  },
  preview: {
    position: "relative",
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  previewScene: { backgroundColor: colors.transparent },
  cardBody: {
    width: "100%",
    minWidth: 0,
    minHeight: slimeUi.shopCardBodyMinHeight,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    gap: spacing.xs,
    alignItems: "flex-start",
  },
  title: {
    ...typography.label,
    width: "100%",
    color: colors.text,
    textAlign: "left",
  },
  price: {
    ...typography.subtitle,
    color: colors.text,
    textAlign: "left",
    fontVariant: ["tabular-nums"],
  },
  detail: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "left",
    fontVariant: ["tabular-nums"],
  },
  contentMuted: {
    opacity: states.disabledOpacity,
  },
  ownedOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: layers.cardOverlay,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  ownedOverlayText: {
    ...typography.micro,
    color: colors.text,
    fontWeight: "800",
    textAlign: "center",
    includeFontPadding: false,
  },
});
