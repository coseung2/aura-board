import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { AppButton, AppModal, ControlPressable } from "../ui";
import { SlimeSprite } from "./SlimeSprite";
import {
  SLIME_COLOR_LABELS,
  SLIME_COOKIE_ITEM_KEY,
  SLIME_MAX_PURCHASE_QUANTITY,
  isSceneBackgroundItem,
  resolveEquippedSlimeWearables,
  resolveEquippedVehicle,
  resolveSlimeRemoteSpriteUri,
  selectSceneBackgroundSpritePath,
  slimeBallSpritePath,
  slimeShopPreviewColor,
  type SlimeShopItem,
} from "../../lib/slimes";
import { getApiBase } from "../../lib/api";
import { calculateSlimePurchaseBalanceSummary } from "../../lib/slime-purchase-summary";
import type { SlimeColor } from "../../lib/slime-assets";
import {
  borders,
  colors,
  radii,
  slimeUi,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";

type Props = {
  item: SlimeShopItem;
  /** Colors the student owns, used as the preview carousel pages. */
  previewColors: readonly SlimeColor[];
  balance: number;
  unitLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (quantity: number) => void;
};

const SLIME_TRAMPOLINE_ITEM_KEY = "slime-blue-trampoline";

/**
 * Confirmation step for a mobile shop purchase.
 *
 * Mirrors the web dialog: quantity is offered only for consumables, because every
 * other item is owned once per student and merely equipped per slime, so buying
 * two would charge for something the student can never receive twice.
 */
export function SlimePurchaseConfirmModal({
  item,
  previewColors,
  balance,
  unitLabel,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const supportsQuantity = item.key === SLIME_COOKIE_ITEM_KEY;
  const [quantity, setQuantity] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);

  const colorPages = useMemo<readonly SlimeColor[]>(
    () => (previewColors.length > 0 ? previewColors : (["blue"] as const)),
    [previewColors],
  );
  const activeColor =
    colorPages[Math.min(pageIndex, colorPages.length - 1)] ?? "blue";
  const previewColor = slimeShopPreviewColor(item, activeColor);
  const maxQuantity = supportsQuantity ? SLIME_MAX_PURCHASE_QUANTITY : 1;
  /**
   * Advisory only. The wallet check that actually protects the ledger runs
   * server-side, so a stale client balance must never be the reason a student
   * cannot complete a purchase.
   */
  const balanceSummary = calculateSlimePurchaseBalanceSummary(
    item.price,
    quantity,
    balance,
  );

  const preview = useMemo(() => {
    const wearables = resolveEquippedSlimeWearables([item.key], [item]);
    return {
      action: item.category === "drink" ? ("drink" as const) : ("idle" as const),
      drinkFlavor: wearables.drink,
      wearables,
    };
  }, [item]);

  const vehicle = useMemo(
    () => resolveEquippedVehicle([item.key], [item]),
    [item],
  );
  const usesTrampoline = vehicle?.key === SLIME_TRAMPOLINE_ITEM_KEY;
  const usesVehicleScene = Boolean(vehicle);
  const renderedVehicle = usesTrampoline ? null : vehicle;
  const backgroundSpritePath = isSceneBackgroundItem(item)
    ? selectSceneBackgroundSpritePath(item)
    : undefined;

  // Only legacy ball props are complete character images. Vehicle, background,
  // floor, drink, and wearable art each has its own composition slot; passing
  // any of those through itemSpritePath would replace the pet entirely.
  const itemSpritePath = item.key.startsWith("slime-ball-")
    ? slimeBallSpritePath([item.key], previewColor) ?? item.spritePath
    : undefined;

  const step = (delta: number) => {
    setQuantity((current) =>
      Math.min(maxQuantity, Math.max(1, current + delta)),
    );
  };

  const singlePage = colorPages.length <= 1;

  return (
    <AppModal
      visible
      onClose={onCancel}
      animationType="fade"
      accessibilityLabel={`${item.labelKo} 구매 확인`}
      sheetStyle={styles.sheet}
      closeOnBackdropPress
    >
      <View style={styles.header}>
        <Text style={styles.title}>{item.labelKo}</Text>
      </View>

      <View
        style={[styles.previewRow, usesVehicleScene && styles.previewRowVehicle]}
        accessibilityLabel="펫 미리보기"
      >
        <ControlPressable
          style={styles.arrow}
          disabled={singlePage}
          onPress={() =>
            setPageIndex(
              (index) => (index - 1 + colorPages.length) % colorPages.length,
            )
          }
          accessibilityLabel="이전 펫 미리보기"
        >
          <ChevronLeft size={20} color={colors.textMuted} />
        </ControlPressable>
        <View style={styles.preview}>
          <View style={[styles.previewMedia, usesVehicleScene && styles.previewMediaVehicle]}>
            {backgroundSpritePath ? (
              <Image
                source={{
                  uri: resolveSlimeRemoteSpriteUri(backgroundSpritePath, getApiBase()),
                }}
                style={styles.fullBleedBackground}
                contentFit="cover"
                transition={0}
                accessible={false}
              />
            ) : null}
            <SlimeSprite
              slimeColor={previewColor}
              evolution="base"
              action={usesTrampoline ? "floor-interaction" : preview.action}
              equippedFloor={usesTrampoline ? "trampoline" : item.floor ?? "none"}
              displayScale={0.4}
              repeat={item.category === "drink"}
              expandSceneSurfaces={usesTrampoline || Boolean(backgroundSpritePath)}
              itemSpritePath={itemSpritePath}
              wearables={preview.wearables}
              drinkFlavor={preview.drinkFlavor}
              vehicleSpritePath={renderedVehicle?.vehicleSheetPath ?? renderedVehicle?.spritePath}
              vehicleGroundedSpritePath={renderedVehicle?.vehicleGroundedSpritePath}
              vehicleEffectSpritePaths={renderedVehicle?.vehicleEffectSpritePaths}
              vehicleFrameCount={renderedVehicle?.vehicleFrameCount}
              vehicleGroundedFrameCount={renderedVehicle?.vehicleGroundedFrameCount}
              vehicleGroundedFrameDurationMs={renderedVehicle?.vehicleGroundedFrameDurationMs}
              vehicleCanvasHeight={renderedVehicle?.vehicleCanvasHeight}
              vehicleCharacterOffsetY={renderedVehicle?.vehicleCharacterOffsetY}
              vehicleBobY={renderedVehicle?.vehicleBobY}
              vehicleRiseY={renderedVehicle?.vehicleRiseY}
              vehicleOffsetX={renderedVehicle?.vehicleOffsetX}
              accessibilityLabel={`${SLIME_COLOR_LABELS[activeColor]} 슬라임에 ${item.labelKo} 미리보기`}
            />
          </View>
          <Text style={styles.previewLabel}>
            {SLIME_COLOR_LABELS[activeColor]} 슬라임
          </Text>
        </View>
        <ControlPressable
          style={styles.arrow}
          disabled={singlePage}
          onPress={() =>
            setPageIndex((index) => (index + 1) % colorPages.length)
          }
          accessibilityLabel="다음 펫 미리보기"
        >
          <ChevronRight size={20} color={colors.textMuted} />
        </ControlPressable>
      </View>

      {singlePage ? null : (
        <View
          style={styles.dots}
          accessibilityLabel={`보유 펫 ${colorPages.length}마리 중 ${pageIndex + 1}번째`}
        >
          {colorPages.map((color, index) => (
            <View
              key={color}
              style={[styles.dot, index === pageIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}

      {supportsQuantity ? (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>수량</Text>
          <View style={styles.stepper}>
            <ControlPressable
              style={styles.stepButton}
              disabled={quantity <= 1 || busy}
              onPress={() => step(-1)}
              accessibilityLabel="수량 줄이기"
            >
              <Text style={styles.stepButtonText}>−</Text>
            </ControlPressable>
            <Text style={styles.quantity} accessibilityLabel="구매 수량">
              {quantity}
            </Text>
            <ControlPressable
              style={styles.stepButton}
              disabled={quantity >= maxQuantity || busy}
              onPress={() => step(1)}
              accessibilityLabel="수량 늘리기"
            >
              <Text style={styles.stepButtonText}>＋</Text>
            </ControlPressable>
          </View>
        </View>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.rowLabel}>금액</Text>
        <Text style={styles.total}>
          {balanceSummary.total.toLocaleString()}
          {unitLabel}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>현재 잔액</Text>
        <Text style={styles.total}>
          {balanceSummary.currentBalance.toLocaleString()}
          {unitLabel}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>구매 후 잔액</Text>
        <Text style={styles.total} accessibilityLiveRegion="polite">
          {balanceSummary.remainingBalance.toLocaleString()}
          {unitLabel}
        </Text>
      </View>

      {balanceSummary.shortOnFunds ? (
        <Text style={styles.warning} accessibilityRole="alert">
          잔액이 부족해요.
        </Text>
      ) : null}

      <View style={styles.footer}>
        <AppButton
          variant="quiet"
          style={styles.footerButton}
          disabled={busy}
          onPress={onCancel}
        >
          취소
        </AppButton>
        <AppButton
          style={styles.footerButton}
          loading={busy}
          onPress={() => onConfirm(quantity)}
        >
          구매하기
        </AppButton>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  previewRow: {
    minHeight: slimeUi.purchasePreviewHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  previewRowVehicle: {
    minHeight: slimeUi.purchaseVehiclePreviewHeight,
  },
  arrow: {
    minWidth: tapMin,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  preview: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  previewMedia: {
    position: "relative",
    width: "100%",
    minHeight: slimeUi.purchasePreviewHeight,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  previewMediaVehicle: {
    minHeight: slimeUi.purchaseVehiclePreviewHeight,
  },
  fullBleedBackground: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  previewLabel: {
    ...typography.label,
    color: colors.textMuted,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
  },
  dot: {
    width: slimeUi.carouselDotSize,
    height: slimeUi.carouselDotSize,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.text,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textMuted,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stepButton: {
    minWidth: tapMin,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
  },
  stepButtonText: {
    ...typography.subtitle,
    color: colors.text,
  },
  quantity: {
    minWidth: 40,
    textAlign: "center",
    ...typography.subtitle,
    color: colors.text,
  },
  total: {
    ...typography.subtitle,
    color: colors.text,
  },
  warning: {
    ...typography.label,
    color: colors.danger,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  footerButton: {
    flex: 1,
  },
});
