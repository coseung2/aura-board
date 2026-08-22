import { Image } from "expo-image";
import { Ban } from "lucide-react-native";
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { ContentTab, ContentTabs } from "../NavigationTabs";
import { AppBottomSheet, BarePressable } from "../ui";
import { SlimeBuffTierChip } from "./SlimeBuffTierChip";
import { SlimeSprite } from "./SlimeSprite";
import { getApiBase } from "../../lib/api";
import type { SlimeColor } from "../../lib/slime-assets";
import {
  isSceneBackgroundItem,
  selectSceneBackgroundSpritePath,
  slimeShopPreviewColor,
  SLIME_COLOR_LABELS,
  type MobileSlimeHome,
  type SlimeShopItem,
} from "../../lib/slimes";
import {
  slimeShopItemBuffLabel,
  slimeShopItemPreview,
  slimeShopItemSpritePath,
  type SlimeWardrobeFilter,
} from "../../lib/slime-shop-presentation";
import {
  borders,
  colors,
  iconSizes,
  layers,
  radii,
  slimeUi,
  spacing,
  states,
  tapMin,
  typography,
} from "../../theme/tokens";

type Notice = { kind: "success" | "error"; text: string };
type ClaimedTitle = MobileSlimeHome["claimedTitles"][number];

type SlimeWardrobeSheetProps = {
  color: SlimeColor | null;
  selectedColor: SlimeColor;
  notice: Notice | null;
  navItems: readonly { key: SlimeWardrobeFilter; label: string }[];
  filter: SlimeWardrobeFilter;
  titles: readonly ClaimedTitle[];
  equippedTitleKey: string | null;
  items: readonly SlimeShopItem[];
  equippedItemKeys: readonly string[];
  hiddenItemKeys: readonly string[];
  busyItemKey: string | null;
  itemWearer: (itemKey: string) => string | null;
  onClose: () => void;
  onFilterChange: (filter: SlimeWardrobeFilter) => void;
  onToggleTitle: (titleKey: string, equipped: boolean) => void;
  onToggleItem: (item: SlimeShopItem) => void;
  onToggleItemVisibility: (item: SlimeShopItem, hidden: boolean) => void;
};

/** Independently testable native wardrobe/customization bottom-sheet content. */
export function SlimeWardrobeSheet({
  color,
  selectedColor,
  notice,
  navItems,
  filter,
  titles,
  equippedTitleKey,
  items,
  equippedItemKeys,
  hiddenItemKeys,
  busyItemKey,
  itemWearer,
  onClose,
  onFilterChange,
  onToggleTitle,
  onToggleItem,
  onToggleItemVisibility,
}: SlimeWardrobeSheetProps) {
  const { width } = useWindowDimensions();
  const cardWidth = width >= 700 ? "31.5%" : "47.8%";

  return (
    <AppBottomSheet
      visible={color !== null}
      onClose={onClose}
      sheetStyle={styles.sheet}
      accessibilityLabel={`${color ? SLIME_COLOR_LABELS[color] : "슬라임"} 꾸미기`}
    >
      <Text style={styles.title}>
        {color
          ? `${SLIME_COLOR_LABELS[color]} 슬라임 꾸미기`
          : "슬라임 꾸미기"}
      </Text>
      {notice ? (
        <View
          style={[
            styles.notice,
            notice.kind === "error"
              ? styles.noticeError
              : styles.noticeSuccess,
          ]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text
            style={[
              styles.noticeText,
              notice.kind === "error"
                ? styles.noticeErrorText
                : styles.noticeSuccessText,
            ]}
          >
            {notice.text}
          </Text>
        </View>
      ) : null}
      <ContentTabs style={styles.nav} accessibilityLabel="보유 아이템 카테고리">
        {navItems.map((item) => (
          <ContentTab
            key={item.key}
            style={styles.navItem}
            selected={filter === item.key}
            onPress={() => onFilterChange(item.key)}
          >
            {item.label}
          </ContentTab>
        ))}
      </ContentTabs>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filter === "title" ? (
          titles.length === 0 ? (
            <EmptyWardrobeState text="걷기와 독서 미션에서 칭호를 받아 오세요." />
          ) : (
            titles.map((title) => {
              const equipped = equippedTitleKey === title.key;
              const busy = busyItemKey === title.key;
              return (
                <View
                  key={title.key}
                  style={[
                    styles.item,
                    { width: cardWidth },
                  ]}
                  accessible
                  accessibilityLabel={`${title.label} 칭호 ${equipped ? "해제" : "장착"}`}
                  accessibilityState={{ selected: equipped, busy }}
                >
                  <View
                    style={[
                      styles.preview,
                      equipped && styles.previewEquipped,
                    ]}
                    accessible={false}
                  >
                    <Image
                      source={{ uri: `${getApiBase()}${title.imagePath}` }}
                      style={styles.titlePreview}
                      contentFit="contain"
                      accessible={false}
                    />
                  </View>
                  <View style={[styles.cardBody, styles.wardrobeCardBody]}>
                    <View style={styles.itemCopy}>
                      <Text style={styles.itemTitle}>{title.label}</Text>
                      <Text style={styles.itemSubtitle}>
                        +{title.buffBps / 100}%
                      </Text>
                    </View>
                    <BarePressable
                      disabled={busyItemKey !== null}
                      hitSlop={spacing.sm}
                      onPress={() => onToggleTitle(title.key, equipped)}
                      accessibilityRole="button"
                      accessibilityLabel={`${title.label} 칭호 ${equipped ? "해제" : "장착"}`}
                    >
                      <Text
                        style={[
                          styles.actionText,
                          equipped
                            ? styles.actionDanger
                            : styles.actionPrimary,
                        ]}
                      >
                        {busy ? "처리 중…" : equipped ? "해제" : "장착"}
                      </Text>
                    </BarePressable>
                  </View>
                </View>
              );
            })
          )
        ) : items.length === 0 ? (
          <EmptyWardrobeState text="이 카테고리에 보유한 아이템이 없어요." />
        ) : (
          items.map((item) => {
            const equipped = equippedItemKeys.includes(item.key);
            const hidden = equipped && hiddenItemKeys.includes(item.key);
            const wornByOther = !equipped ? itemWearer(item.key) : null;
            const busy = busyItemKey === item.key;
            const buffLabel = slimeShopItemBuffLabel(item);
            const preview = slimeShopItemPreview(item);
            const sceneBackground = isSceneBackgroundItem(item);
            return (
              <View
                key={item.key}
                style={[
                  styles.item,
                  { width: cardWidth },
                ]}
                accessible
                accessibilityLabel={`${item.labelKo} ${
                  equipped
                    ? "해제"
                    : wornByOther
                      ? `${wornByOther} 슬라임 장착 중, 옮겨서 장착`
                      : "장착"
                }`}
                accessibilityState={{ selected: equipped, busy }}
              >
                <View
                  style={[
                    styles.preview,
                    sceneBackground && styles.previewScene,
                    equipped && styles.previewEquipped,
                  ]}
                  accessible={false}
                >
                  <View
                    style={[
                      styles.previewVisual,
                      wornByOther && styles.contentDimmed,
                    ]}
                  >
                    <SlimeSprite
                      slimeColor={
                        filter === "prop" || filter === "drink"
                          ? (color ?? selectedColor)
                          : slimeShopPreviewColor(
                              item,
                              color ?? selectedColor,
                            )
                      }
                      evolution="base"
                      action={preview.action}
                      equippedFloor={preview.equippedFloor}
                      displayScale={slimeUi.shopCardSceneDisplayScale}
                      repeat={
                        Boolean(preview.propAction) ||
                        preview.action !== "idle"
                      }
                      expandSceneSurfaces={
                        preview.expandSceneSurfaces || sceneBackground
                      }
                      itemSpritePath={
                        sceneBackground
                          ? undefined
                          : slimeShopItemSpritePath(item)
                      }
                      propAction={preview.propAction}
                      backgroundSpritePath={
                        sceneBackground
                          ? selectSceneBackgroundSpritePath(item)
                          : undefined
                      }
                      wearables={preview.wearables}
                      drinkFlavor={preview.drinkFlavor}
                      vehicleSpritePath={
                        preview.vehicle?.vehicleSheetPath ??
                        preview.vehicle?.spritePath
                      }
                      vehicleGroundedSpritePath={
                        preview.vehicle?.vehicleGroundedSpritePath
                      }
                      vehicleEffectSpritePaths={
                        preview.vehicle?.vehicleEffectSpritePaths
                      }
                      vehicleFrameCount={preview.vehicle?.vehicleFrameCount}
                      vehicleGroundedFrameCount={
                        preview.vehicle?.vehicleGroundedFrameCount
                      }
                      vehicleGroundedFrameDurationMs={
                        preview.vehicle?.vehicleGroundedFrameDurationMs
                      }
                      vehicleCanvasHeight={preview.vehicle?.vehicleCanvasHeight}
                      vehicleCharacterOffsetY={
                        preview.vehicle?.vehicleCharacterOffsetY
                      }
                      vehicleBobY={preview.vehicle?.vehicleBobY}
                      vehicleRiseY={preview.vehicle?.vehicleRiseY}
                      vehicleOffsetX={preview.vehicle?.vehicleOffsetX}
                      accessibilityLabel={`${item.labelKo} 미리보기`}
                    />
                    {buffLabel ? (
                      <SlimeBuffTierChip
                        label={buffLabel}
                        bps={item.effectBps ?? 0}
                      />
                    ) : null}
                  </View>
                  {wornByOther ? (
                    <View style={styles.wornOverlay} pointerEvents="none">
                      <Ban size={iconSizes.sm} color={colors.danger} accessible={false} />
                      <Text style={styles.wornOverlayText}>
                        {wornByOther} 슬라임에{"\n"}장착 중
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.cardBody,
                    styles.shopCardBody,
                    styles.wardrobeCardBody,
                  ]}
                >
                  <View
                    style={[
                      styles.itemCopy,
                      wornByOther && styles.contentDimmed,
                    ]}
                  >
                    <Text style={styles.itemTitle}>{item.labelKo}</Text>
                  </View>
                  <View style={styles.actions}>
                    {equipped ? (
                      <>
                        <BarePressable
                          disabled={busyItemKey !== null}
                          hitSlop={spacing.sm}
                          onPress={() => onToggleItem(item)}
                          accessibilityRole="button"
                          accessibilityLabel={`${item.labelKo} 해제`}
                        >
                          <Text style={[styles.actionText, styles.actionDanger]}>
                            {busy ? "처리 중…" : "해제"}
                          </Text>
                        </BarePressable>
                        <BarePressable
                          disabled={busyItemKey !== null}
                          hitSlop={spacing.sm}
                          onPress={() => onToggleItemVisibility(item, hidden)}
                          accessibilityRole="button"
                          accessibilityLabel={`${item.labelKo} 외형 ${hidden ? "보이기" : "숨기기"}`}
                          accessibilityState={{ checked: !hidden, busy }}
                        >
                          <Text style={styles.actionText}>
                            {hidden ? "보이기" : "숨기기"}
                          </Text>
                        </BarePressable>
                      </>
                    ) : (
                      <BarePressable
                        disabled={busyItemKey !== null}
                        hitSlop={spacing.sm}
                        onPress={() => onToggleItem(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.labelKo} ${wornByOther ? "여기로 옮기기" : "장착"}`}
                      >
                        <Text style={[styles.actionText, styles.actionPrimary]}>
                          {busy
                            ? "처리 중…"
                            : wornByOther
                              ? "여기로 옮기기"
                              : "장착"}
                        </Text>
                      </BarePressable>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </AppBottomSheet>
  );
}

function EmptyWardrobeState({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  title: { ...typography.title, color: colors.text },
  notice: {
    width: "100%",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.btn,
  },
  noticeText: { ...typography.label },
  noticeSuccess: { backgroundColor: colors.noticeSuccessBg },
  noticeError: { backgroundColor: colors.noticeErrorBg },
  noticeSuccessText: { color: colors.plantActive },
  noticeErrorText: { color: colors.danger },
  nav: { width: "100%" },
  navItem: { flex: 1 },
  list: { maxHeight: iconSizes.empty * 6 },
  listContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: spacing.sm,
  },
  item: {
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
  previewEquipped: {
    borderWidth: borders.medium,
    borderColor: colors.accent,
  },
  previewScene: { backgroundColor: colors.transparent },
  previewVisual: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  contentDimmed: { opacity: states.disabledOpacity },
  wornOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: layers.cardOverlay,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  wornOverlayText: {
    ...typography.micro,
    color: colors.text,
    textAlign: "center",
    fontWeight: "700",
    includeFontPadding: false,
  },
  cardBody: {
    width: "100%",
    minWidth: 0,
    minHeight: slimeUi.wardrobeCardBodyMinHeight,
    gap: spacing.xs,
  },
  shopCardBody: {
    paddingHorizontal: spacing.none,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    gap: spacing.xxs,
  },
  wardrobeCardBody: { gap: spacing.xxs },
  itemCopy: {
    width: "100%",
    minWidth: 0,
    alignItems: "flex-start",
    gap: spacing.xxs,
  },
  itemTitle: { ...typography.label, color: colors.text, textAlign: "left" },
  itemSubtitle: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "left",
  },
  actions: {
    width: "100%",
    minHeight: tapMin,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: spacing.xs,
  },
  actionText: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    includeFontPadding: false,
  },
  actionPrimary: { color: colors.accentTintedText },
  actionDanger: { color: colors.danger },
  titlePreview: { width: "78%", height: "62%" },
  empty: { width: "100%", padding: spacing.lg },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: "center" },
});
