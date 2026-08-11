import { ActivityIndicator } from "react-native";
import { Animated } from "react-native";
import { AppButton } from "../../components/ui";
import { AppHeader } from "../../components/ui";
import { BarePressable } from "../../components/ui";
import { CircleAlert } from "lucide-react-native";
import { CircleCheck } from "lucide-react-native";
import { ContentTab } from "../../components/NavigationTabs";
import { ContentTabs } from "../../components/NavigationTabs";
import { ControlPressable } from "../../components/ui";
import type { EquippedFloor } from "../../lib/slime-assets";
import { Fragment } from "react";
import { Image } from "expo-image";
import { RefreshControl } from "react-native";
import { SLIME_ASSET_COLORS } from "../../lib/slime-assets";
import { SLIME_COLOR_LABELS } from "../../lib/slimes";
import { SLIME_SHARED_ASSETS } from "../../lib/slime-assets";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import type { SlimeAction } from "../../lib/slime-assets";
import { SlimePurchaseConfirmModal } from "../../components/slime/SlimePurchaseConfirmModal";
import {
  SlimeCharacterCatalogCard,
  SlimeShopItemCard,
} from "../../components/slime/SlimeShopCatalogCards";
import { SlimeSprite } from "../../components/slime/SlimeSprite";
import { SlimeWardrobeSheet } from "../../components/slime/SlimeWardrobeSheet";
import { Star } from "lucide-react-native";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";
import { Text } from "react-native";
import { View } from "react-native";
import { WalkingTitleSlot } from "../../components/WalkingTitleSlot";
import { calculateGrowthTimeComparison } from "../../lib/slimes";
import { calculateSlimeGrowthPercent } from "../../lib/slimes";
import { colors } from "../../theme/tokens";
import { formatGrowthHours } from "../../lib/slimes";
import { getApiBase } from "../../lib/api";
import { iconSizes } from "../../theme/tokens";
import { resolveEquippedSceneBackground } from "../../lib/slimes";
import { resolveEquippedSlimePropAction } from "../../lib/slime-props";
import { resolveEquippedSlimeWearables } from "../../lib/slimes";
import { resolveEquippedVehicle } from "../../lib/slimes";
import { selectSceneBackgroundSpritePath } from "../../lib/slimes";
import { spacing } from "../../theme/tokens";
import { stageForColor } from "../../lib/slimes";
import { styles } from "./student-slime.styles";
import { visibleEquippedSlimeItemKeys } from "../../lib/slime-item-visibility";
import type { SlimeCatalogItem, SlimeShopItem } from "../../lib/slimes";
import type { StudentSlimeScreenViewModel } from "../../lib/student-slime-screen/student-slime-screen.types";
import { StudentSlimeClassroomSection } from "./student-slime-classroom-section";
import { StudentSlimeCollectionSection } from "./student-slime-collection-section";
import { StudentSlimeShopSection } from "./student-slime-shop-section";

export function StudentSlimeScreenView({
  model,
}: {
  model: StudentSlimeScreenViewModel;
}) {
  const {
    openEffectColor,
    openGrowthColor,
    setOpenEffectColor,
    setOpenGrowthColor,
    router,
    showInitialLoading,
    showInitialError,
    error,
    load,
    section,
    classmates,
    loadClassroom,
    setShopFilter,
    refreshing,
    classroomLoading,
    classroomError,
    home,
    SLIME_TRAMPOLINE_ITEM_KEY,
    petCardScene,
    equippedFloor,
    selectedColor,
    appliedGrowthSpeedBps,
    buffGroupsByColor,
    manualActions,
    activeSets,
    SLIME_EFFECT_LABELS,
    formatBuffPercent,
    setManualActions,
    buffArrowAnimatedStyle,
    busyRepresentative,
    setRepresentative,
    setSelectedColor,
    setWardrobeColor,
    cookieQuantity,
    busyItemKey,
    feedCookie,
    DISABLED_COOKIE_SOURCE,
    localSource,
    buffGroups,
    appliedBuffTotals,
    SLIME_EFFECT_DESCRIPTIONS,
    shopNavItems,
    shopFilter,
    shopOverviewSections,
    busyColor,
    confirmSlimePurchase,
    confirmItemPurchase,
    visibleShopItems,
    nestedShopGroups,
    visibleShopTiers,
    wardrobeColor,
    notice,
    wardrobeNavItems,
    wardrobeFilter,
    visibleWardrobeTitles,
    wardrobeTargetColor,
    visibleWardrobeItems,
    wardrobeEquippedItems,
    wardrobeItemWearer,
    setWardrobeFilter,
    toggleTitle,
    toggleItem,
    toggleItemVisibility,
    pendingPurchase,
    setPendingPurchase,
    purchaseItem,
  } = model;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {openEffectColor || openGrowthColor ? (
        <ControlPressable
          style={styles.effectDismissLayer}
          onPress={() => {
            setOpenEffectColor(null);
            setOpenGrowthColor(null);
          }}
          accessibilityRole="button"
          accessibilityLabel="버프 상세 닫기"
        >
          {null}
        </ControlPressable>
      ) : null}
      <AppHeader
        title="펫"
        onBack={() => router.back()}
        right={
          showInitialLoading || showInitialError ? undefined : (
            <StudentHeaderActions />
          )
        }
      />
      {showInitialLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>펫 화면으로 이동 중…</Text>
        </View>
      ) : showInitialError ? (
        <View style={styles.errorCenter}>
          <Text style={styles.errorEmoji}>🫧</Text>
          <Text style={styles.errorTitle}>펫 화면을 열 수 없어요</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <AppButton onPress={() => void load()}>다시 시도</AppButton>
        </View>
      ) : (
        <>
          <View style={styles.pageTabsRow}>
            <ContentTabs
              style={styles.petSectionNav}
              accessibilityLabel="펫 섹션"
            >
              <ContentTab
                style={styles.petSectionNavItem}
                selected={section === "mine"}
                onPress={() => router.setParams({ section: "mine" })}
              >
                내 펫
              </ContentTab>
              <ContentTab
                style={styles.petSectionNavItem}
                selected={section === "classroom"}
                onPress={() => {
                  if (classmates !== null) {
                    void loadClassroom();
                  }
                  router.setParams({ section: "classroom" });
                }}
              >
                우리 반 펫
              </ContentTab>
              <ContentTab
                style={styles.petSectionNavItem}
                selected={section === "shop"}
                onPress={() => {
                  setShopFilter("all");
                  router.setParams({ section: "shop" });
                }}
              >
                상점
              </ContentTab>
            </ContentTabs>
          </View>
          <ScrollView
            removeClippedSubviews
            contentContainerStyle={[
              styles.scrollContent,
              styles.scrollContentWide,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void load(true)}
                tintColor={colors.accent}
              />
            }
          >
            {section === "classroom" ? (
              <StudentSlimeClassroomSection model={model} />
            ) : (
              <>
                {section === "mine" ? (
                  <StudentSlimeCollectionSection model={model} />
                ) : null}

                {section === "shop" ? (
                  <StudentSlimeShopSection model={model} />
                ) : null}
              </>
            )}
          </ScrollView>
          <SlimeWardrobeSheet
            color={wardrobeColor}
            selectedColor={selectedColor}
            notice={notice}
            navItems={wardrobeNavItems}
            filter={wardrobeFilter}
            titles={visibleWardrobeTitles}
            equippedTitleKey={
              home?.equippedTitleByColor?.[wardrobeTargetColor] ?? null
            }
            items={visibleWardrobeItems}
            equippedItemKeys={wardrobeEquippedItems}
            hiddenItemKeys={home?.hiddenItemsByColor[wardrobeTargetColor] ?? []}
            busyItemKey={busyItemKey}
            itemWearer={wardrobeItemWearer}
            onClose={() => setWardrobeColor(null)}
            onFilterChange={setWardrobeFilter}
            onToggleTitle={(titleKey, equipped) =>
              void toggleTitle(titleKey, equipped)
            }
            onToggleItem={(item) => void toggleItem(item)}
            onToggleItemVisibility={(item, hidden) =>
              void toggleItemVisibility(item, hidden)
            }
          />
          {pendingPurchase ? (
            <SlimePurchaseConfirmModal
              item={pendingPurchase}
              previewColors={home?.ownedColors ?? []}
              balance={home?.balance ?? 0}
              unitLabel={home?.unitLabel ?? "원"}
              busy={busyItemKey === pendingPurchase.key}
              onCancel={() => {
                if (busyItemKey !== pendingPurchase.key)
                  setPendingPurchase(null);
              }}
              onConfirm={(quantity) => {
                const item = pendingPurchase;
                void purchaseItem(item, quantity).finally(() => {
                  setPendingPurchase(null);
                });
              }}
            />
          ) : null}
          {notice ? (
            <View
              pointerEvents="none"
              style={[
                styles.notice,
                notice.kind === "error"
                  ? styles.noticeError
                  : styles.noticeSuccess,
              ]}
              accessibilityRole="alert"
            >
              {notice.kind === "error" ? (
                <CircleAlert
                  size={iconSizes.sm}
                  color={colors.danger}
                  style={styles.noticeIcon}
                  accessible={false}
                />
              ) : (
                <CircleCheck
                  size={iconSizes.sm}
                  color={colors.plantActive}
                  style={styles.noticeIcon}
                  accessible={false}
                />
              )}
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
        </>
      )}
    </SafeAreaView>
  );
}
