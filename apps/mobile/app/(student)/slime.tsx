import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image, type ImageProps } from "expo-image";
import {
  ArrowLeft,
  Check,
  Star,
} from "lucide-react-native";
import {
  AppBottomSheet,
  AppButton,
  AppHeader,
  ControlPressable,
} from "../../components/ui";
import {
  ContentTab,
  ContentTabs,
} from "../../components/NavigationTabs";
import { SlimeSprite } from "../../components/slime/SlimeSprite";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";
import { WalkingTitleSlot } from "../../components/WalkingTitleSlot";
import { equipPetTitle } from "../../lib/titles";
import {
  SLIME_ASSET_COLORS,
  SLIME_SHARED_ASSETS,
  type EquippedFloor,
  type SlimeAction,
  type SlimeColor,
} from "../../lib/slime-assets";
import {
  aggregateMobileSlimeBuffTotals,
  evolutionForStage,
  calculateGrowthTimeComparison,
  calculateSlimeGrowthPercent,
  floorLabel,
  formatGrowthHours,
  isSceneBackgroundItem,
  groupSlimeShopItemsByTier,
  groupSlimeOutfitsByRole,
  groupSlimePropsByKind,
  mobileSlimeActiveSets,
  mobileSlimeBuffGroups,
  newSlimeIdempotencyKey,
  normalizeSlimeClassroom,
  normalizeSlimeHome,
  resolveEquippedSceneBackground,
  resolveEquippedVehicle,
  resolveEquippedSlimeWearables,
  selectSceneBackgroundSpritePath,
  shopFilterForItem,
  slimeBallSpritePath,
  slimeShopPreviewColor,
  slimeShopNavItems,
  SLIME_COOKIE_ITEM_KEY,
  SLIME_COLOR_LABELS,
  SLIME_STAGE_LABELS,
  stageForColor,
  type MobileSlimeHome,
  type MobileSlimeClassmate,
  type SlimeCatalogItem,
  type SlimeShopItem,
  type SlimeShopFilter,
} from "../../lib/slimes";
import { ApiError, apiFetch, getApiBase } from "../../lib/api";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import {
  borders,
  colors,
  controls,
  iconSizes,
  layers,
  layout,
  pageChrome,
  radii,
  shadows,
  slimeUi,
  spacing,
  states,
  tapMin,
  typography,
} from "../../theme/tokens";

type Notice = { kind: "success" | "error"; text: string };
type LocalImageSource = ImageProps["source"];
type WardrobeFilter = "background" | "floor" | "drink" | "prop" | "outfit" | "title";

const DISABLED_COOKIE_SOURCE = require("../../assets/slimes/shared/cookie-shop-icon-256-disabled.png");

const WARDROBE_NAV_ITEMS: readonly { key: WardrobeFilter; label: string }[] = [
  { key: "floor", label: "바닥" },
  { key: "drink", label: "음료" },
  { key: "prop", label: "소품" },
  { key: "outfit", label: "착장" },
  { key: "title", label: "칭호" },
];

const ERROR_LABELS: Record<string, string> = {
  insufficient_funds: "잔액이 부족해요.",
  already_owned: "이미 보유한 상품이에요.",
  unknown_item: "상품을 찾을 수 없어요.",
  not_owned: "먼저 상품을 구매해 주세요.",
  idempotency_key_reused: "같은 요청 키가 다른 상품에 사용됐어요. 다시 시도해 주세요.",
  account_not_found: "학생 지갑을 찾을 수 없어요.",
  invalid_body: "요청을 확인해 주세요.",
};

const FLOOR_ORDER: Exclude<EquippedFloor, "none">[] = [
  "grass-floor",
  "crystal-cave-floor",
  "moonlit-marble-floor",
  "royal-garden-floor",
  "celestial-gold-floor",
  "snow-ground-floor",
  "ancient-brick-floor",
  "cherry-stone-floor",
  "sand-trail-floor",
  "forest-soil-floor",
  "stone-floor",
  "water-puddle",
  "trampoline",
];

const SLIME_EFFECT_LABELS: Record<string, string> = {
  growth_speed: "성장 속도",
  reading_reward: "독서 보상",
  walking_reward: "걷기 보상",
  assignment_reward: "과제 보상",
  comment_reward: "댓글 보상",
};

function shopItemBuffLabel(item: SlimeShopItem): string | null {
  if (!item.effectKey || !item.effectBps) return null;
  const label = SLIME_EFFECT_LABELS[item.effectKey] ?? item.effectKey;
  return `${label} +${item.effectBps / 100}%`;
}

function formatBuffPercent(bps: number): string {
  return `${(bps / 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
}

function localSource(value: unknown): LocalImageSource {
  return value as LocalImageSource;
}

function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.body && typeof error.body === "object" && "error" in error.body) {
      const code = (error.body as { error?: unknown }).error;
      if (typeof code === "string") return ERROR_LABELS[code] ?? `요청에 실패했어요 (${code})`;
    }
    return ERROR_LABELS[error.message] ?? error.message;
  }
  return error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.";
}

function itemFloor(item: SlimeShopItem): Exclude<EquippedFloor, "none"> | null {
  return item.floor && (FLOOR_ORDER as readonly string[]).includes(item.floor)
    ? item.floor
    : null;
}

function wardrobeFilterForItem(item: SlimeShopItem): WardrobeFilter {
  if (isSceneBackgroundItem(item)) return "background";
  if (item.floor || item.category === "background" || item.category === "ride") return "floor";
  if (item.category === "drink") return "drink";
  if (item.category === "wearable") return "outfit";
  return "prop";
}

/**
 * Complete preview sprite for a shop item, or `undefined` for drinks.
 *
 * Drinks compose from the anchor registry, so handing back a complete GIF would
 * replace the character sheet and suppress the composed drink layer.
 */
function shopItemSpritePath(item: SlimeShopItem, slimeColor: SlimeColor): string | undefined {
  if (item.category === "drink" || item.category === "wearable") return undefined;
  if (!item.key.startsWith("slime-ball-")) return item.mobileSpritePath ?? item.spritePath;
  return slimeBallSpritePath([item.key], slimeColor) ?? item.spritePath;
}

/** Preview action and flavor for a shop item that composes rather than replaces. */
function shopItemPreview(item: SlimeShopItem) {
  const wearables = resolveEquippedSlimeWearables([item.key], [item]);
  return {
    action: item.category === "drink" ? "drink" as const : "idle" as const,
    drinkFlavor: wearables.drink,
    wearables,
  };
}

function equippedItemSpritePath(
  itemKeys: readonly string[],
  slimeColor: SlimeColor,
): string | undefined {
  const ballPath = slimeBallSpritePath(itemKeys, slimeColor);
  if (ballPath) return ballPath;
  // Drinks compose from the anchor registry. Returning a complete GIF here would
  // replace the character sheet and suppress every composed wearable layer.
  return undefined;
}

export default function StudentSlimeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const [home, setHome] = useState<MobileSlimeHome | null>(null);
  const [selectedColor, setSelectedColor] = useState<SlimeColor>("blue");
  const [manualActions, setManualActions] = useState<Partial<Record<SlimeColor, SlimeAction>>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null);
  const [busyColor, setBusyColor] = useState<SlimeColor | null>(null);
  const [busyRepresentative, setBusyRepresentative] = useState<SlimeColor | null>(null);
  const [shopFilter, setShopFilter] = useState<SlimeShopFilter>("character");
  const [wardrobeColor, setWardrobeColor] = useState<SlimeColor | null>(null);
  const [wardrobeFilter, setWardrobeFilter] = useState<WardrobeFilter>("floor");
  const [openEffectColor, setOpenEffectColor] = useState<SlimeColor | null>(null);
  const [openGrowthColor, setOpenGrowthColor] = useState<SlimeColor | null>(null);
  const [classmates, setClassmates] = useState<MobileSlimeClassmate[] | null>(null);
  const [classroomLoading, setClassroomLoading] = useState(false);
  const [classroomError, setClassroomError] = useState<string | null>(null);
  const retryKeysRef = useRef(new Map<string, string>());
  const buffRise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(buffRise, {
          toValue: 0.48,
          duration: 552,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
        Animated.timing(buffRise, {
          toValue: 1,
          duration: 598,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [buffRise]);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    const hasSceneBackground = (home?.shopCatalog ?? []).some((item) => isSceneBackgroundItem(item));
    if (!hasSceneBackground && shopFilter === "background") {
      setShopFilter("character");
    }
    if (!hasSceneBackground && wardrobeFilter === "background") {
      setWardrobeFilter("floor");
    }
  }, [home?.shopCatalog, shopFilter, wardrobeFilter]);

  const buffArrowAnimatedStyle = {
    opacity: buffRise.interpolate({ inputRange: [0, 0.48, 1], outputRange: [0.78, 1, 0.78] }),
    transform: [
      { translateY: buffRise.interpolate({ inputRange: [0, 0.48, 1], outputRange: [2, -3, 2] }) },
      { scale: buffRise.interpolate({ inputRange: [0, 0.48, 1], outputRange: [0.94, 1.04, 0.94] }) },
    ],
  };

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const response = await apiFetch<unknown>("/api/student/slimes");
        const nextHome = normalizeSlimeHome(response);
        setHome(nextHome);
        setSelectedColor((current) => {
          if (nextHome.ownedColors.includes(current)) return current;
          return (
            nextHome.representativeColor ?? nextHome.ownedColors[0] ?? current
          );
        });
        setError(null);
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.status === 401) {
          await clearSessionToken();
          router.replace(getUnifiedLoginRoute("student"));
          return;
        }
        setError(apiErrorMessage(loadError));
      } finally {
        setLoading(false);
        if (isRefresh) setRefreshing(false);
      }
    },
    [router],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const owned = home?.ownedColors.includes(selectedColor) ?? false;
  const equippedFloor =
    home?.equippedFloorByColor[selectedColor] ??
    (home?.representativeColor === selectedColor ? home.equippedFloor : "none");
  const equippedItems = home?.equippedItemsByColor[selectedColor] ?? [];
  const shopNavItems = useMemo(
    () => slimeShopNavItems(home?.shopCatalog ?? []),
    [home?.shopCatalog],
  );
  const wardrobeNavItems = useMemo(() => {
    const hasSceneBackground = (home?.shopCatalog ?? []).some((item) => isSceneBackgroundItem(item));
    if (!hasSceneBackground) return WARDROBE_NAV_ITEMS;
    return [
      { key: "background" as const, label: "배경" },
      ...WARDROBE_NAV_ITEMS,
    ];
  }, [home?.shopCatalog]);
  const sceneBackgroundItems = useMemo(
    () => (home?.shopCatalog ?? []).filter((item) => isSceneBackgroundItem(item)),
    [home?.shopCatalog],
  );
  /** Backgrounds grouped by price tier, entry band first and premium band last. */
  const sceneBackgroundTiers = useMemo(
    () => groupSlimeShopItemsByTier(sceneBackgroundItems),
    [sceneBackgroundItems],
  );
  const floorItems = useMemo(() => {
    if (!home) return [];
    return FLOOR_ORDER.map((floor) =>
      home.shopCatalog.find((item) => itemFloor(item) === floor),
    ).filter((item): item is SlimeShopItem => item !== undefined);
  }, [home]);
  const cookieQuantity = home?.ownedItemQuantities[SLIME_COOKIE_ITEM_KEY] ?? 0;
  const visibleShopItems = useMemo(
    () => home?.shopCatalog.filter((item) => shopFilterForItem(item) === shopFilter) ?? [],
    [home, shopFilter],
  );
  /**
   * Price bands for each shop list, cheapest first. Categories priced uniformly
   * come back as one unlabelled group and render exactly as before.
   */
  const floorTiers = useMemo(() => groupSlimeShopItemsByTier(floorItems), [floorItems]);
  /** Family set bonuses are account-wide, so they are computed once per home. */
  const activeSets = useMemo(() => (home ? mobileSlimeActiveSets(home) : []), [home]);

  /**
   * Which other pet is wearing an item, if any.
   *
   * A piece lives in one place at a time, so equipping it here takes it off that
   * pet. Surfacing the current wearer stops that from looking like the item
   * vanished from another slime, and it matters for family sets, where the same
   * piece cannot count twice.
   */
  const wardrobeItemWearer = useCallback(
    (itemKey: string): string | null => {
      if (!home) return null;
      for (const [color, itemKeys] of Object.entries(home.equippedItemsByColor)) {
        if (color === wardrobeColor) continue;
        if (!itemKeys?.includes(itemKey)) continue;
        return SLIME_COLOR_LABELS[color as SlimeColor] ?? color;
      }
      return null;
    },
    [home, wardrobeColor],
  );
  const visibleShopTiers = useMemo(
    () => groupSlimeShopItemsByTier(visibleShopItems),
    [visibleShopItems],
  );
  /**
   * Outfits nest one level deeper: slot sub-categories separated by a rule, and
   * price bands within each slot separated by spacing alone.
   */
  const visibleOutfitGroups = useMemo(
    () =>
      groupSlimeOutfitsByRole(visibleShopItems).map((group) => ({
        ...group,
        tiers: groupSlimeShopItemsByTier(group.items),
      })),
    [visibleShopItems],
  );
  /** Props nest the same way outfits do: sub-category, then price band. */
  const visiblePropGroups = useMemo(
    () =>
      groupSlimePropsByKind(visibleShopItems).map((group) => ({
        ...group,
        tiers: groupSlimeShopItemsByTier(group.items),
      })),
    [visibleShopItems],
  );
  /**
   * Sub-category groups for the tabs that have them, or null for the flat tabs.
   *
   * Outfits group by slot and props by kind, but both render identically, so the
   * list picks the grouping here rather than branching per tab in the markup.
   */
  const nestedShopGroups = useMemo(() => {
    if (shopFilter === "outfit") {
      return visibleOutfitGroups.map((group) => ({ ...group, key: group.role }));
    }
    if (shopFilter === "prop") return visiblePropGroups;
    return null;
  }, [shopFilter, visibleOutfitGroups, visiblePropGroups]);

  /**
   * One shop card. Extracted so the flat list and the nested outfit list render
   * identical cards rather than keeping two copies of this markup in step.
   */
  const renderShopItemCard = (item: SlimeShopItem) => {
    const quantity = home?.ownedItemQuantities[item.key] ?? 0;
    const repeatable = item.key === SLIME_COOKIE_ITEM_KEY;
    const ownedItem = repeatable ? quantity > 0 : home?.ownedItemKeys.includes(item.key) ?? false;
    const busy = busyItemKey === item.key;
    const buffLabel = shopItemBuffLabel(item);
    const itemSummary = [
      buffLabel,
      repeatable
        ? `${quantity}개 보유`
        : !ownedItem
          ? `${item.price.toLocaleString()}${home?.unitLabel ?? "원"}`
          : null,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" · ");
    return (
      <ControlPressable
        key={item.key}
        style={styles.floorRow}
        disabled={busyItemKey !== null || (ownedItem && !repeatable)}
        onPress={() => confirmItemPurchase(item)}
        accessibilityLabel={`${item.labelKo} ${repeatable && quantity > 0 ? `${quantity}개 보유, 구매` : ownedItem ? "보유 중" : "구매"}`}
      >
        <View style={styles.shopPreview} accessible={false}>
          <SlimeSprite
            slimeColor={slimeShopPreviewColor(item, selectedColor)}
            evolution="base"
            action={shopItemPreview(item).action}
            equippedFloor="none"
            displayScale={0.25}
            repeat={item.category === "drink"}
            itemSpritePath={shopItemSpritePath(item, selectedColor)}
            wearables={shopItemPreview(item).wearables}
            drinkFlavor={shopItemPreview(item).drinkFlavor}
            accessibilityLabel={`${item.labelKo} 미리보기`}
          />
        </View>
        <View style={styles.floorCopy}>
          <Text style={styles.floorTitle}>{item.labelKo}</Text>
          {itemSummary ? <Text style={styles.floorSubtitle}>{itemSummary}</Text> : null}
        </View>
        <Text style={[styles.floorStatusText, (repeatable || !ownedItem) && styles.floorStatusBuy]}>
          {busy ? "처리 중…" : repeatable ? "구매" : ownedItem ? "보유 중" : "구매"}
        </Text>
      </ControlPressable>
    );
  };
  const wardrobeItems = useMemo(
    () => home?.shopCatalog.filter((item) =>
      home.ownedItemKeys.includes(item.key)
      && item.category !== "food"
      && item.category !== "level-up",
    ) ?? [],
    [home],
  );
  const visibleWardrobeItems = useMemo(
    () => wardrobeItems.filter((item) => wardrobeFilterForItem(item) === wardrobeFilter),
    [wardrobeFilter, wardrobeItems],
  );
  const buffGroups = useMemo(() => home ? mobileSlimeBuffGroups(home) : [], [home]);
  const buffGroupsByColor = useMemo(
    () => new Map(buffGroups.map((group) => [group.color, group])),
    [buffGroups],
  );
  const appliedBuffTotals = useMemo(
    () => aggregateMobileSlimeBuffTotals(buffGroups),
    [buffGroups],
  );
  const appliedGrowthSpeedBps = appliedBuffTotals.find(
    (effect) => effect.effectKey === "growth_speed",
  )?.bps ?? 0;
  const section = params.section === "classroom"
    ? "classroom"
    : params.section === "shop"
      ? "shop"
      : "mine";

  const loadClassroom = useCallback(async () => {
    setClassroomLoading(true);
    setClassroomError(null);
    try {
      const response = await apiFetch<unknown>("/api/student/slimes/classroom");
      setClassmates(normalizeSlimeClassroom(response));
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        await clearSessionToken();
        router.replace(getUnifiedLoginRoute("student"));
        return;
      }
      setClassroomError(apiErrorMessage(loadError));
    } finally {
      setClassroomLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (
      section === "classroom" &&
      classmates === null &&
      !classroomLoading &&
      classroomError === null
    ) {
      void loadClassroom();
    }
  }, [classmates, classroomError, classroomLoading, loadClassroom, section]);

  const retryKey = useCallback((scope: string, identity: string) => {
    const mapKey = `${scope}:${identity}`;
    const current = retryKeysRef.current.get(mapKey);
    if (current) return current;
    const created = newSlimeIdempotencyKey(scope, identity);
    retryKeysRef.current.set(mapKey, created);
    return created;
  }, []);

  const clearRetryKey = useCallback((scope: string, identity: string) => {
    retryKeysRef.current.delete(`${scope}:${identity}`);
  }, []);

  const mutateFloor = useCallback(
    async (item: SlimeShopItem) => {
      const floor = itemFloor(item);
      if (!floor || !home || !home.ownedColors.includes(selectedColor)) return;
      const currentFloor =
        home.equippedFloorByColor[selectedColor] ?? "none";
      if (currentFloor === floor) {
        if (floor === "water-puddle" || floor === "trampoline") {
          setManualActions((current) => ({
            ...current,
            [selectedColor]: "floor-interaction",
          }));
        }
        return;
      }

      const owned = home.ownedItemKeys.includes(item.key);
      const scope = owned ? "slime-floor-equip" : "slime-floor-purchase";
      const keyIdentity = owned ? `${selectedColor}:${item.key}` : item.key;
      setBusyItemKey(item.key);
      setNotice(null);
      try {
        if (!owned) {
          await apiFetch("/api/student/slimes/items/purchase", {
            method: "POST",
            json: { itemKey: item.key },
            headers: { "Idempotency-Key": retryKey(scope, keyIdentity) },
          });
          await apiFetch("/api/student/slimes/items/equip", {
            method: "POST",
            json: { itemKey: item.key, slimeColor: selectedColor, isEquipped: true },
            headers: {
              "Idempotency-Key": retryKey(
                "slime-floor-equip",
                `${selectedColor}:${item.key}`,
              ),
            },
          });
          setNotice({ kind: "success", text: `${item.labelKo}를 구매하고 장착했어요.` });
          clearRetryKey(scope, keyIdentity);
          clearRetryKey("slime-floor-equip", `${selectedColor}:${item.key}`);
        } else {
          await apiFetch("/api/student/slimes/items/equip", {
            method: "POST",
            json: { itemKey: item.key, slimeColor: selectedColor, isEquipped: true },
            headers: { "Idempotency-Key": retryKey(scope, keyIdentity) },
          });
          setNotice({ kind: "success", text: `${item.labelKo}를 장착했어요.` });
          clearRetryKey(scope, keyIdentity);
        }
        await load(true);
      } catch (mutationError) {
        if (mutationError instanceof ApiError && mutationError.status === 401) {
          await clearSessionToken();
          router.replace(getUnifiedLoginRoute("student"));
          return;
        }
        setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
      } finally {
        setBusyItemKey(null);
      }
    },
    [clearRetryKey, home, load, retryKey, router, selectedColor],
  );

  const purchaseSlime = useCallback(async (color: SlimeColor) => {
    if (!home || busyColor || home.ownedColors.includes(color)) return;
    setBusyColor(color);
    setNotice(null);
    try {
      await apiFetch("/api/student/slimes/purchase", {
        method: "POST",
        json: { color },
        headers: { "Idempotency-Key": retryKey("slime-purchase", color) },
      });
      clearRetryKey("slime-purchase", color);
      setNotice({ kind: "success", text: `${SLIME_COLOR_LABELS[color]} 슬라임을 구매했어요.` });
      await load(true);
    } catch (mutationError) {
      setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
    } finally {
      setBusyColor(null);
    }
  }, [busyColor, clearRetryKey, home, load, retryKey]);

  const setRepresentative = useCallback(async (color: SlimeColor) => {
    if (!home || !home.ownedColors.includes(color) || busyRepresentative) return;
    setBusyRepresentative(color);
    setNotice(null);
    try {
      await apiFetch("/api/student/slimes/representative", {
        method: "POST",
        json: { color },
      });
      setNotice({ kind: "success", text: `${SLIME_COLOR_LABELS[color]} 슬라임을 대표로 지정했어요.` });
      await load(true);
    } catch (mutationError) {
      setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
    } finally {
      setBusyRepresentative(null);
    }
  }, [busyRepresentative, home, load]);

  const purchaseItem = useCallback(async (item: SlimeShopItem) => {
    if (!home || busyItemKey) return;
    setBusyItemKey(item.key);
    setNotice(null);
    try {
      await apiFetch("/api/student/slimes/items/purchase", {
        method: "POST",
        json: { itemKey: item.key },
        headers: { "Idempotency-Key": retryKey("slime-item-purchase", item.key) },
      });
      clearRetryKey("slime-item-purchase", item.key);
      setNotice({ kind: "success", text: `${item.labelKo}를 구매했어요.` });
      await load(true);
    } catch (mutationError) {
      setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
    } finally {
      setBusyItemKey(null);
    }
  }, [busyItemKey, clearRetryKey, home, load, retryKey]);

  const confirmSlimePurchase = useCallback((slime: SlimeCatalogItem) => {
    Alert.alert(
      "구매 확인",
      `${slime.nameKo}을(를) ${slime.price.toLocaleString()}${home?.unitLabel ?? "원"}에 구매할까요?`,
      [
        { text: "취소", style: "cancel" },
        { text: "구매", onPress: () => void purchaseSlime(slime.color) },
      ],
    );
  }, [home?.unitLabel, purchaseSlime]);

  const confirmItemPurchase = useCallback((item: SlimeShopItem) => {
    Alert.alert(
      "구매 확인",
      `${item.labelKo}을(를) ${item.price.toLocaleString()}${home?.unitLabel ?? "원"}에 구매할까요?`,
      [
        { text: "취소", style: "cancel" },
        { text: "구매", onPress: () => void purchaseItem(item) },
      ],
    );
  }, [home?.unitLabel, purchaseItem]);

  const toggleItem = useCallback(async (item: SlimeShopItem) => {
    if (!home || !owned || busyItemKey || item.category === "food") return;
    const isEquipped = !equippedItems.includes(item.key);
    setBusyItemKey(item.key);
    setNotice(null);
    try {
      await apiFetch("/api/student/slimes/items/equip", {
        method: "POST",
        json: { itemKey: item.key, slimeColor: selectedColor, isEquipped },
        headers: {
          "Idempotency-Key": retryKey(
            "slime-item-equip",
            `${selectedColor}:${item.key}:${isEquipped}`,
          ),
        },
      });
      clearRetryKey(
        "slime-item-equip",
        `${selectedColor}:${item.key}:${isEquipped}`,
      );
      setNotice({ kind: "success", text: `${item.labelKo}를 ${isEquipped ? "적용" : "해제"}했어요.` });
      await load(true);
    } catch (mutationError) {
      setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
    } finally {
      setBusyItemKey(null);
    }
  }, [busyItemKey, clearRetryKey, equippedItems, home, load, owned, retryKey, selectedColor]);

  const toggleTitle = useCallback(async (titleKey: string, equipped: boolean) => {
    const targetColor = wardrobeColor ?? selectedColor;
    if (!home || !targetColor || busyItemKey) return;
    setBusyItemKey(titleKey);
    setNotice(null);
    try {
      await equipPetTitle(targetColor, equipped ? null : titleKey);
      setNotice({
        kind: "success",
        text: `칭호를 ${equipped ? "해제" : "적용"}했어요.`,
      });
      await load(true);
    } catch (mutationError) {
      setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
    } finally {
      setBusyItemKey(null);
    }
  }, [busyItemKey, home, load, selectedColor, wardrobeColor]);

  const feedCookie = useCallback(async (color: SlimeColor) => {
    if (!home || !home.ownedColors.includes(color) || cookieQuantity <= 0 || busyItemKey) return;
    setBusyItemKey(SLIME_COOKIE_ITEM_KEY);
    setNotice(null);
    try {
      await apiFetch("/api/student/slimes/items/consume", {
        method: "POST",
        json: { itemKey: SLIME_COOKIE_ITEM_KEY, color },
        headers: {
          "Idempotency-Key": retryKey("slime-cookie-use", color),
        },
      });
      clearRetryKey("slime-cookie-use", color);
      setManualActions((current) => ({ ...current, [color]: "happy" }));
      setNotice({ kind: "success", text: `${SLIME_COLOR_LABELS[color]} 슬라임에게 쿠키를 먹였어요.` });
      await load(true);
    } catch (mutationError) {
      setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
    } finally {
      setBusyItemKey(null);
    }
  }, [busyItemKey, clearRetryKey, cookieQuantity, home, load, retryKey]);

  const showInitialLoading = loading && !home;
  const showInitialError = Boolean(error && !home);

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
        right={showInitialLoading || showInitialError ? undefined : <StudentHeaderActions />}
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
            onPress={() => router.setParams({ section: "classroom" })}
          >
            우리 반 펫
          </ContentTab>
          <ContentTab
            style={styles.petSectionNavItem}
            selected={section === "shop"}
            onPress={() => {
              setShopFilter("character");
              router.setParams({ section: "shop" });
            }}
          >
            상점
          </ContentTab>
        </ContentTabs>
      </View>
      <ScrollView
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
          classroomLoading && classmates === null ? (
            <View style={styles.classroomState}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.classroomText}>우리 반 펫을 불러오는 중…</Text>
            </View>
          ) : classroomError && classmates === null ? (
            <View style={styles.classroomCard}>
              <Text style={styles.classroomEmoji} accessible={false}>😵</Text>
              <Text style={styles.classroomTitle}>우리 반 펫을 불러오지 못했어요</Text>
              <Text style={styles.classroomText}>{classroomError}</Text>
              <AppButton onPress={() => void loadClassroom()}>다시 시도</AppButton>
            </View>
          ) : classmates?.length === 0 ? (
            <View style={styles.classroomCard}>
              <Text style={styles.classroomEmoji} accessible={false}>🫧</Text>
              <Text style={styles.classroomTitle}>아직 소개할 펫이 없어요</Text>
              <Text style={styles.classroomText}>친구들이 대표 펫을 지정하면 여기에 보여요.</Text>
            </View>
          ) : (
            <View style={styles.classroomList} accessibilityLabel="우리 반 대표 펫 목록">
              {classmates?.map((student) => {
                const representative = student.representative;
                const classItems = representative
                  ? home?.shopCatalog.filter((item) =>
                      representative.equippedItemKeys.includes(item.key),
                    ) ?? []
                  : [];
                const classFloor = classItems.reduce<EquippedFloor>(
                  (current, item) => item.floor ?? current,
                  "none",
                );
                const classVehicleItem = representative
                  ? resolveEquippedVehicle(
                      representative.equippedItemKeys,
                      home?.shopCatalog ?? [],
                    )
                  : null;
                const classAction: SlimeAction = classItems.some(
                  (item) => item.category === "drink",
                )
                  ? "drink"
                  : // The trampoline is a vehicle now, so its jump timeline keys off
                    // the equipped vehicle rather than a floor value.
                    classVehicleItem?.key === "slime-blue-trampoline"
                    ? "floor-interaction"
                    : "idle";
                const classItemSpritePath = representative
                  ? equippedItemSpritePath(
                      representative.equippedItemKeys,
                      representative.color,
                    )
                  : undefined;
                const classWearables = representative
                  ? resolveEquippedSlimeWearables(
                      representative.equippedItemKeys,
                      home?.shopCatalog ?? [],
                    )
                  : null;
                const classBackground = representative
                  ? resolveEquippedSceneBackground(
                      representative.equippedItemKeys,
                      home?.shopCatalog ?? [],
                    )
                  : null;
                return (
                  <View key={student.id} style={styles.classmateCard}>
                    <View style={styles.classmateSprite}>
                      {representative ? (
                          <SlimeSprite
                            slimeColor={representative.color}
                            growthStage={representative.growthStage}
                            action={classAction}
                            equippedFloor={classFloor}
                            displayScale={0.25}
                            repeat={classAction !== "idle"}
                            itemSpritePath={classItemSpritePath}
                            wearables={classWearables ?? undefined}
                            drinkFlavor={classWearables?.drink}
                            backgroundSpritePath={
                              classBackground
                                ? selectSceneBackgroundSpritePath(classBackground)
                                : undefined
                            }
                            vehicleSpritePath={classVehicleItem?.spritePath}
                            vehicleRiseY={classVehicleItem?.vehicleRiseY}
                            accessibilityLabel={`${student.name}의 ${SLIME_COLOR_LABELS[representative.color]} 대표 펫`}
                          />
                      ) : (
                        <View style={styles.noRepresentative}>
                          <Text style={styles.classmatePlaceholderText}>대표 펫 미지정</Text>
                        </View>
                      )}
                    </View>
                    {student.walkingTitle ? (
                      <WalkingTitleSlot title={student.walkingTitle} />
                    ) : (
                      <View style={styles.classmateTitleSpacer} />
                    )}
                    <Text style={styles.classmateName} numberOfLines={1}>
                      {student.number !== null ? `${student.number}번 ` : ""}{student.name}
                    </Text>
                  </View>
                );
              })}
            </View>
          )
        ) : (
          <>
        {section === "mine" ? (
          <>
        <View style={styles.myPetGrid} accessibilityRole="radiogroup" accessibilityLabel="내 슬라임 목록">
          {SLIME_ASSET_COLORS.map((itemColor, colorIndex) => {
            const isOwned = home?.ownedColors.includes(itemColor) ?? false;
            const selected = selectedColor === itemColor;
            const petStage = home ? stageForColor(home, itemColor) : 1;
            const growth = home?.growthByColor[itemColor];
            const growthPercent = growth ? calculateSlimeGrowthPercent(growth) : 0;
            const growthTime = growth
              ? calculateGrowthTimeComparison(growth.remainingSeconds, appliedGrowthSpeedBps)
              : null;
            const petBuffGroup = buffGroupsByColor.get(itemColor);
            const petItems = home?.equippedItemsByColor[itemColor] ?? [];
            const petWearables = resolveEquippedSlimeWearables(
              petItems,
              home?.shopCatalog ?? [],
            );
            const petFloor = home?.equippedFloorByColor[itemColor] ?? "none";
            const petBackground = resolveEquippedSceneBackground(
              petItems,
              home?.shopCatalog ?? [],
            );
            const petVehicle = resolveEquippedVehicle(
              petItems,
              home?.shopCatalog ?? [],
            );
            const petHasDrink = (home?.shopCatalog ?? []).some(
              (item) => item.category === "drink" && petItems.includes(item.key),
            );
            const manualAction = manualActions[itemColor];
            const petAction: SlimeAction = manualAction
              ? manualAction
              : petHasDrink
                ? "drink"
                : // The trampoline is a vehicle now, so its jump timeline is keyed
                  // off the equipped vehicle rather than a floor value.
                  petVehicle?.key === "slime-blue-trampoline"
                  ? "floor-interaction"
                  : "idle";
            return (
              <Fragment key={itemColor}>
                {/* Five pets fill a three-column grid with one cell to spare. Set
                    bonuses are account-wide rather than per pet, so they take that
                    cell, placed before the final pet so the row reads
                    pet · sets · pet. */}
                {colorIndex === SLIME_ASSET_COLORS.length - 1 ? (
                  <View style={styles.myPetSetCard} accessibilityLabel="적용 중인 세트 효과">
                    {/* The heading aligns with the pet names beside it, so it sits at
                        the top of the cell and entries fill downward from there
                        rather than being centred as a block. */}
                    <Text style={styles.myPetSetTitle}>세트 효과</Text>
                    {activeSets.map((set) => (
                      <View key={set.key} style={styles.myPetSetRow}>
                        <Text style={styles.myPetSetName} numberOfLines={2}>{set.label}</Text>
                        <Text style={styles.myPetSetValue}>
                          {SLIME_EFFECT_LABELS[set.effectKey] ?? set.effectKey} +{formatBuffPercent(set.bps)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              <View
                style={[
                  styles.myPetCard,
                  !isOwned && styles.myPetCardDisabled,
                  (openEffectColor === itemColor || openGrowthColor === itemColor) && styles.myPetCardEffectOpen,
                ]}
              >
                <View style={[
                  styles.myPetSprite,
                  openEffectColor === itemColor && styles.myPetSpriteEffectOpen,
                ]}>
                  {isOwned ? (
                    <>
                      <View style={styles.myPetOverlayRow} pointerEvents="box-none">
                        <ControlPressable
                          style={styles.myPetEffectButton}
                          onPress={() => {
                            setOpenGrowthColor(null);
                            setOpenEffectColor((current) => current === itemColor ? null : itemColor);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 슬라임 버프 상세 보기`}
                          accessibilityState={{ expanded: openEffectColor === itemColor }}
                          hitSlop={spacing.xs}
                        >
                          <Animated.View style={buffArrowAnimatedStyle}>
                            <Image
                              source={{ uri: `${getApiBase()}/creatures/slimes/ui/growth-buff-arrow.png` }}
                              style={styles.myPetEffectArrow}
                              contentFit="contain"
                              transition={0}
                              accessible={false}
                            />
                          </Animated.View>
                        </ControlPressable>
                        <ControlPressable
                          style={styles.myPetStarButton}
                          disabled={busyRepresentative !== null || home?.representativeColor === itemColor}
                          onPress={() => void setRepresentative(itemColor)}
                          accessibilityRole="button"
                          accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 슬라임을 대표로 지정`}
                          accessibilityState={{ selected: home?.representativeColor === itemColor, busy: busyRepresentative === itemColor }}
                          hitSlop={spacing.xs}
                        >
                          <Star
                            size={iconSizes.sm}
                            color={home?.representativeColor === itemColor ? colors.warning : colors.textFaint}
                            fill={home?.representativeColor === itemColor ? colors.warning : colors.textFaint}
                            accessible={false}
                          />
                        </ControlPressable>
                      </View>
                      {openEffectColor === itemColor ? (
                        <View style={styles.myPetEffectPopover} accessibilityRole="summary">
                          <Text style={styles.myPetEffectPopoverTitle}>버프 내역</Text>
                          {petBuffGroup?.entries.map((effect) => (
                            <View key={`${effect.source}:${effect.key}`} style={styles.myPetEffectPopoverRow}>
                              <Text style={styles.myPetEffectPopoverText}>{effect.label}</Text>
                              <Text style={styles.myPetEffectPopoverValue}>
                                {SLIME_EFFECT_LABELS[effect.effectKey] ?? effect.effectKey} +{formatBuffPercent(effect.bps)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </>
                  ) : null}
                  {isOwned ? (
                    <SlimeSprite
                      slimeColor={itemColor}
                      growthStage={petStage}
                      action={petAction}
                      equippedFloor={petFloor}
                      displayScale={0.25}
                      repeat={!manualAction && petAction !== "idle"}
                      itemSpritePath={equippedItemSpritePath(
                        petItems,
                        itemColor,
                      )}
                      wearables={petWearables}
                      drinkFlavor={petWearables.drink}
                      backgroundSpritePath={
                        petBackground
                          ? selectSceneBackgroundSpritePath(petBackground)
                          : undefined
                      }
                      vehicleSpritePath={petVehicle?.spritePath}
                      vehicleRiseY={petVehicle?.vehicleRiseY}
                      accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 슬라임`}
                      onComplete={manualAction
                        ? () => setManualActions((current) => {
                            const next = { ...current };
                            delete next[itemColor];
                            return next;
                          })
                        : undefined}
                    />
                  ) : (
                    <View style={styles.unownedSprite} accessible accessibilityRole="image" accessibilityLabel="아직 보유하지 않은 슬라임">
                      <Text style={styles.unownedGlyph}>?</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.myPetName, selected && styles.myPetNameSelected]}>{SLIME_COLOR_LABELS[itemColor]}</Text>
                {isOwned ? (
                  <ControlPressable
                    style={styles.myPetGrowth}
                    disabled={!growthTime}
                    onPress={() => {
                      setOpenEffectColor(null);
                      setOpenGrowthColor((current) => current === itemColor ? null : itemColor);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 성장 경험치`}
                    accessibilityValue={{ min: 0, max: 100, now: growthPercent, text: `성장 ${petStage}단계 ${growthPercent}%` }}
                  >
                    <View style={styles.myPetGrowthMeta}>
                      <Text style={styles.myPetGrowthLabel}>성장 {petStage}단계</Text>
                      <Text style={styles.myPetGrowthPercent}>{growthPercent}%</Text>
                    </View>
                    <View style={styles.myPetGrowthTrack} accessible={false}>
                      <View style={[styles.myPetGrowthFill, { width: `${growthPercent}%` }]} />
                    </View>
                    {openGrowthColor === itemColor && growthTime ? (
                      <View style={styles.myPetGrowthPopover} accessibilityRole="summary">
                        <Text style={styles.myPetEffectPopoverTitle}>
                          성장 속도 +{appliedGrowthSpeedBps / 100}% 적용 중
                        </Text>
                        <Text style={styles.myPetEffectPopoverText}>
                          버프 적용 전 {formatGrowthHours(growthTime.withoutBuffSeconds)}
                        </Text>
                        <Text style={styles.myPetEffectPopoverText}>
                          적용 후 {formatGrowthHours(growthTime.withBuffSeconds)}
                        </Text>
                      </View>
                    ) : null}
                  </ControlPressable>
                ) : null}
                <View style={styles.myPetActions} accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 펫 관리`}>
                  <ControlPressable
                    style={styles.myPetActionButton}
                    disabled={!isOwned}
                    hitSlop={spacing.xs}
                    onPress={() => {
                      setSelectedColor(itemColor);
                      setWardrobeColor(itemColor);
                    }}
                  >
                    <Text style={styles.myPetActionText}>꾸미기</Text>
                  </ControlPressable>
                  <ControlPressable
                    style={styles.myPetCookieButton}
                    disabled={!isOwned || cookieQuantity <= 0 || busyItemKey !== null}
                    hitSlop={spacing.xs}
                    onPress={() => void feedCookie(itemColor)}
                    accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]}에게 쿠키 주기, ${cookieQuantity}개 보유`}
                  >
                    <Image
                      source={cookieQuantity <= 0
                        ? DISABLED_COOKIE_SOURCE
                        : localSource(SLIME_SHARED_ASSETS.cookie.image)}
                      style={styles.myPetCookieIcon}
                      contentFit="contain"
                      allowDownscaling={false}
                      transition={0}
                      accessible={false}
                    />
                    <Text style={[
                      styles.myPetCookieQuantity,
                      cookieQuantity <= 0 && styles.myPetCookieQuantityDisabled,
                    ]}>{cookieQuantity}</Text>
                  </ControlPressable>
                </View>
              </View>
              </Fragment>
            );
            })}
          </View>
          <View style={styles.appliedEffects} accessibilityLabel="적용 중인 버프 목록">
          <Text style={styles.appliedEffectsTitle}>적용 중인 버프</Text>
          {buffGroups.length > 0 ? (
            <View style={styles.appliedEffectsList}>
              {appliedBuffTotals.map((effect) => (
                <View key={effect.effectKey} style={styles.appliedEffectRow}>
                  <Text style={styles.appliedEffectLabel} numberOfLines={1}>
                    {SLIME_EFFECT_LABELS[effect.effectKey] ?? effect.effectKey}
                  </Text>
                  <Text style={styles.appliedEffectValue}>+{formatBuffPercent(effect.bps)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.appliedEffectsEmpty}>현재 적용 중인 버프가 없어요.</Text>
          )}
        </View>
          </>
        ) : null}

        {section === "shop" ? (
        <View style={styles.shopPage} accessibilityLabel="슬라임 상점">
          <Text style={styles.shopBalance}>{home?.balance.toLocaleString() ?? 0}{home?.unitLabel ?? "원"}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shopTabs} accessibilityRole="tablist">
          {shopNavItems.map((tab) => (
            <ControlPressable
              key={tab.key}
              style={[styles.shopTab, shopFilter === tab.key && styles.shopTabSelected]}
              onPress={() => setShopFilter(tab.key)}
              hitSlop={spacing.sm}
              accessibilityRole="tab"
              accessibilityState={{ selected: shopFilter === tab.key }}
            >
              <Text style={[styles.shopTabText, shopFilter === tab.key && styles.shopTabTextSelected]}>{tab.label}</Text>
            </ControlPressable>
          ))}
        </ScrollView>
        <View style={styles.shopContent}>
        {shopFilter === "character" ? (
          <View style={styles.floorList}>
            {home?.catalog.map((slime) => {
              const isOwned = home.ownedColors.includes(slime.color);
              const busy = busyColor === slime.color;
              return (
                <ControlPressable key={slime.key} style={styles.floorRow} disabled={isOwned || busyColor !== null} onPress={() => confirmSlimePurchase(slime)} accessibilityLabel={`${slime.nameKo} ${isOwned ? "보유 중" : "구매"}`}>
                  <View style={styles.shopPreview} accessible={false}>
                    <SlimeSprite
                      slimeColor={slime.color}
                      evolution="base"
                      action="idle"
                      equippedFloor="none"
                      displayScale={0.25}
                      accessibilityLabel={`${slime.nameKo} 미리보기`}
                    />
                  </View>
                  <View style={styles.floorCopy}>
                    <Text style={styles.floorTitle}>{slime.nameKo}</Text>
                    <Text style={styles.floorSubtitle}>기본 효과 +{slime.baseBuffBps / 100}%</Text>
                  </View>
                  <Text style={[styles.floorStatusText, !isOwned && styles.floorStatusBuy]}>{busy ? "구매 중…" : isOwned ? "보유 중" : `${slime.price.toLocaleString()}${home.unitLabel}`}</Text>
                </ControlPressable>
              );
            })}
          </View>
        ) : shopFilter === "background" ? (
        <View style={styles.shopTierList} accessibilityLabel="배경 인벤토리">
          {sceneBackgroundItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>배경 상품을 준비 중이에요.</Text>
            </View>
          ) : (
            sceneBackgroundTiers.map((group) => (
              <View key={group.price} style={styles.shopTierGroup}>
                {group.label ? <Text style={styles.shopTierLabel}>{group.label}</Text> : null}
                <View style={styles.shopTierItems}>
                  {group.items.map((item) => {
                  const ownedItem = home?.ownedItemKeys.includes(item.key) ?? false;
                  const busy = busyItemKey === item.key;
                  const canInteract = !ownedItem && busyItemKey === null;
                  const buffLabel = shopItemBuffLabel(item);
                  const status = busy
                    ? "처리 중…"
                    : ownedItem
                      ? "보유 중"
                      : `${item.price.toLocaleString()}${home?.unitLabel ?? "원"}`;
                  return (
                    <ControlPressable
                      key={item.key}
                      style={styles.floorRow}
                      disabled={!canInteract}
                      onPress={() => confirmItemPurchase(item)}
                      accessibilityLabel={`${item.labelKo} ${ownedItem ? "보유 중" : "구매"}`}
                      accessibilityState={{ disabled: !canInteract, busy }}
                    >
                      <View style={[styles.shopPreview, styles.shopPreviewScene]} accessible={false}>
                        <SlimeSprite
                          slimeColor={slimeShopPreviewColor(item, selectedColor)}
                          evolution="base"
                          action="idle"
                          equippedFloor="none"
                          displayScale={0.25}
                          backgroundSpritePath={selectSceneBackgroundSpritePath(item)}
                          accessibilityLabel={`${item.labelKo} 미리보기`}
                        />
                      </View>
                      <View style={styles.floorCopy}>
                        <Text style={styles.floorTitle}>{item.labelKo}</Text>
                        <Text style={styles.floorSubtitle}>{buffLabel ?? "배경"}</Text>
                      </View>
                      <View style={styles.floorStatus}>
                        {busy ? <ActivityIndicator size="small" color={colors.accent} /> : null}
                        <Text style={[styles.floorStatusText, !ownedItem && styles.floorStatusBuy]}>{status}</Text>
                      </View>
                    </ControlPressable>
                  );
                  })}
                </View>
              </View>
            ))
          )}
        </View>
        ) : shopFilter === "floor" ? (
        <View style={styles.shopTierList} accessibilityLabel="바닥 인벤토리">
          {floorItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>바닥 상품을 준비 중이에요.</Text>
            </View>
          ) : (
            floorTiers.map((group) => (
              <View key={group.price} style={styles.shopTierGroup}>
                {group.label ? <Text style={styles.shopTierLabel}>{group.label}</Text> : null}
                <View style={styles.shopTierItems}>
                  {group.items.map((item) => {
              const floor = itemFloor(item);
              if (!floor) return null;
              const ownedItem = home?.ownedItemKeys.includes(item.key) ?? false;
              const busy = busyItemKey === item.key;
              const canInteract = owned && !ownedItem && busyItemKey === null;
              const status = busy
                ? "처리 중…"
                : ownedItem
                  ? "보유 중"
                  : `${item.price.toLocaleString()}${home?.unitLabel ?? "원"}`;
              return (
                <ControlPressable
                  key={item.key}
                  style={styles.floorRow}
                  disabled={!canInteract}
                  onPress={() => confirmItemPurchase(item)}
                  accessibilityLabel={`${floorLabel(floor)} ${ownedItem ? "보유 중" : "구매"}`}
                  accessibilityState={{ disabled: !canInteract, busy }}
                >
                  <View style={styles.shopPreview} accessible={false}>
                    <SlimeSprite
                      slimeColor={slimeShopPreviewColor(item, selectedColor)}
                      evolution="base"
                      action={shopItemPreview(item).action}
                      equippedFloor="none"
                      displayScale={0.25}
                      repeat={item.category === "drink"}
                      itemSpritePath={shopItemSpritePath(item, selectedColor)}
                      wearables={shopItemPreview(item).wearables}
                      drinkFlavor={shopItemPreview(item).drinkFlavor}
                      accessibilityLabel={`${item.labelKo || floorLabel(floor)} 미리보기`}
                    />
                  </View>
                  <View style={styles.floorCopy}>
                    <Text style={styles.floorTitle}>{item.labelKo || floorLabel(floor)}</Text>
                    <Text style={styles.floorSubtitle}>{shopItemBuffLabel(item) ?? floorLabel(floor)}</Text>
                  </View>
                  <View style={styles.floorStatus}>
                    {busy ? <ActivityIndicator size="small" color={colors.accent} /> : null}
                    <Text style={[styles.floorStatusText, !ownedItem && styles.floorStatusBuy]}>{status}</Text>
                  </View>
                </ControlPressable>
              );
                  })}
                </View>
              </View>
            ))
          )}
        </View>
        ) : (
          <View style={styles.shopTierList}>
            {visibleShopItems.length === 0 ? (
              <View style={styles.emptyCard}><Text style={styles.emptyText}>이 분류에는 상품이 없어요.</Text></View>
            ) : nestedShopGroups ? (
              // Outfits and props nest two levels: a ruled divider per
              // sub-category, then price bands inside it separated by spacing.
              nestedShopGroups.map((group, groupIndex) => (
                <View key={group.key} style={styles.shopTierGroup}>
                  {groupIndex > 0 ? <View style={styles.shopOutfitDivider} /> : null}
                  <Text style={styles.shopOutfitLabel}>{group.label}</Text>
                  {group.tiers.map((tier) => (
                    <View key={tier.price} style={styles.shopTierGroup}>
                      {tier.label ? <Text style={styles.shopTierLabel}>{tier.label}</Text> : null}
                      <View style={styles.shopTierItems}>
                        {tier.items.map((item) => renderShopItemCard(item))}
                      </View>
                    </View>
                  ))}
                </View>
              ))
            ) : (
              visibleShopTiers.map((group) => (
                <View key={group.price} style={styles.shopTierGroup}>
                  {group.label ? <Text style={styles.shopTierLabel}>{group.label}</Text> : null}
                  <View style={styles.shopTierItems}>
                    {group.items.map((item) => renderShopItemCard(item))}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
        </View>
        </View>
        ) : null}
          </>
        )}
      </ScrollView>
      <AppBottomSheet
        visible={wardrobeColor !== null}
        onClose={() => setWardrobeColor(null)}
        sheetStyle={styles.wardrobeSheet}
        accessibilityLabel={`${wardrobeColor ? SLIME_COLOR_LABELS[wardrobeColor] : "슬라임"} 꾸미기`}
      >
        <Text style={styles.wardrobeTitle}>
          {wardrobeColor ? `${SLIME_COLOR_LABELS[wardrobeColor]} 슬라임 꾸미기` : "슬라임 꾸미기"}
        </Text>
        <ContentTabs
          style={styles.wardrobeNav}
          accessibilityLabel="보유 아이템 카테고리"
        >
          {wardrobeNavItems.map((item) => (
            <ContentTab
              key={item.key}
              style={styles.wardrobeNavItem}
              selected={wardrobeFilter === item.key}
              onPress={() => setWardrobeFilter(item.key)}
            >
              {item.label}
            </ContentTab>
          ))}
        </ContentTabs>
        <ScrollView style={styles.wardrobeList} contentContainerStyle={styles.wardrobeListContent}>
          {wardrobeFilter === "title" ? (
            (home?.claimedTitles.length ?? 0) === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  걷기와 독서 미션에서 칭호를 받아 오세요.
                </Text>
              </View>
            ) : (
              (home?.claimedTitles ?? []).map((title) => {
                const equipped =
                  wardrobeColor != null &&
                  home?.equippedTitleByColor?.[wardrobeColor] === title.key;
                const busy = busyItemKey === title.key;
                return (
                  <ControlPressable
                    key={title.key}
                    style={[styles.wardrobeItem, equipped && styles.wardrobeItemEquipped]}
                    disabled={busyItemKey !== null}
                    onPress={() => void toggleTitle(title.key, equipped)}
                    accessibilityLabel={`${title.label} 칭호 ${equipped ? "해제" : "장착"}`}
                    accessibilityState={{ selected: equipped, busy }}
                  >
                    <View style={styles.shopPreview} accessible={false}>
                      <Image
                        source={{ uri: `${getApiBase()}${title.imagePath}` }}
                        style={styles.walkingTitlePreview}
                        contentFit="contain"
                        accessible={false}
                      />
                    </View>
                    <View style={styles.wardrobeItemCopy}>
                      <Text style={styles.floorTitle}>{title.label}</Text>
                      <Text style={styles.floorSubtitle}>+{title.buffBps / 100}%</Text>
                    </View>
                    <Text style={[styles.wardrobeItemAction, equipped && styles.wardrobeItemActionEquipped]}>
                      {busy ? "처리 중…" : equipped ? "해제" : "장착"}
                    </Text>
                  </ControlPressable>
                );
              })
            )
          ) : visibleWardrobeItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>이 카테고리에 보유한 아이템이 없어요.</Text>
            </View>
          ) : (
            visibleWardrobeItems.map((item) => {
              const equipped = equippedItems.includes(item.key);
              // An item worn by a different pet is still available here, but the
              // player should know it will move rather than be duplicated.
              const wornByOther = !equipped ? wardrobeItemWearer(item.key) : null;
              const busy = busyItemKey === item.key;
              const buffLabel = shopItemBuffLabel(item);
              return (
                <ControlPressable
                  key={item.key}
                  style={[
                    styles.wardrobeItem,
                    equipped && styles.wardrobeItemEquipped,
                    wornByOther && styles.wardrobeItemWornByOther,
                  ]}
                  disabled={busyItemKey !== null}
                  onPress={() => void toggleItem(item)}
                  accessibilityLabel={`${item.labelKo} ${
                    equipped ? "해제" : wornByOther ? `${wornByOther} 슬라임 장착 중, 옮겨서 장착` : "장착"
                  }`}
                  accessibilityState={{ selected: equipped, busy }}
                >
                  <View
                    style={[
                      styles.shopPreview,
                      // Only scene backgrounds feather to transparent, so only they
                      // need the tinted tile removed.
                      isSceneBackgroundItem(item) && styles.shopPreviewScene,
                    ]}
                    accessible={false}
                  >
                    <SlimeSprite
                      slimeColor={slimeShopPreviewColor(item, wardrobeColor ?? selectedColor)}
                      evolution="base"
                      action={shopItemPreview(item).action}
                      equippedFloor="none"
                      displayScale={0.25}
                      repeat={item.category === "drink"}
                      itemSpritePath={isSceneBackgroundItem(item) ? undefined : shopItemSpritePath(item, wardrobeColor ?? selectedColor)}
                      wearables={shopItemPreview(item).wearables}
                      drinkFlavor={shopItemPreview(item).drinkFlavor}
                      backgroundSpritePath={isSceneBackgroundItem(item) ? selectSceneBackgroundSpritePath(item) : undefined}
                      accessibilityLabel={`${item.labelKo} 미리보기`}
                    />
                  </View>
                  <View style={styles.wardrobeItemCopy}>
                    <Text style={styles.floorTitle}>{item.labelKo}</Text>
                      <Text style={styles.floorSubtitle}>{buffLabel ?? (isSceneBackgroundItem(item) ? "배경" : item.floor ? "바닥" : item.category === "drink" ? "음료" : item.category === "wearable" ? "의상" : "소품")}</Text>
                    {wornByOther ? (
                      <Text style={styles.wardrobeItemWornText}>{wornByOther} 장착 중</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.wardrobeItemAction, equipped && styles.wardrobeItemActionEquipped]}>
                    {busy ? "처리 중…" : equipped ? "해제" : wornByOther ? "옮기기" : "장착"}
                  </Text>
                </ControlPressable>
              );
            })
          )}
        </ScrollView>
      </AppBottomSheet>
      {notice ? (
        <View style={[styles.notice, notice.kind === "error" ? styles.noticeError : styles.noticeSuccess]} accessibilityRole="alert">
          {notice.kind === "error" ? <ArrowLeft size={iconSizes.sm} color={colors.danger} style={styles.noticeIcon} /> : <Check size={iconSizes.sm} color={colors.plantActive} style={styles.noticeIcon} />}
          <Text style={[styles.noticeText, notice.kind === "error" ? styles.noticeErrorText : styles.noticeSuccessText]}>{notice.text}</Text>
        </View>
      ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  effectDismissLayer: { ...StyleSheet.absoluteFillObject, zIndex: layers.overlayControl, borderWidth: borders.none, borderRadius: radii.none, backgroundColor: colors.transparent },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { ...typography.body, color: colors.textMuted },
  errorCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  errorEmoji: { fontSize: iconSizes.gate },
  errorTitle: { ...typography.title, color: colors.text, textAlign: "center" },
  errorMessage: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  scrollContent: { paddingHorizontal: pageChrome.horizontalPadding, paddingTop: pageChrome.contentStartGap, paddingBottom: spacing.xxxl, gap: spacing.lg },
  scrollContentWide: { alignSelf: "center", width: "100%", maxWidth: layout.readableMaxWidth },
  // Section tabs live outside the ScrollView so they stay reachable while
  // browsing long pet, classroom, or shop lists.
  pageTabsRow: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingBottom: spacing.md,
  },
  petSectionNav: { width: "100%" },
  petSectionNavItem: { flex: 1 },
  myPetGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.xs },
  myPetCard: { position: "relative", width: "32%", minWidth: 0, alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xs },
  // While this card owns an open popover it must sit above the cards rendered
  // after it, or their text would paint over the panel.
  myPetCardEffectOpen: { zIndex: layers.floatingPopover },
  myPetCardDisabled: { opacity: states.disabledOpacity },
  myPetSprite: { position: "relative", height: iconSizes.empty + spacing.md, width: "100%", alignItems: "center", justifyContent: "center", overflow: "visible" },
  // Occupies the empty third cell of the second row, so it matches a pet card's
  // width and sits inside the same grid rather than below it.
  // Aligned to the top of the row so its heading reads as a title level with the
  // pet names, with entries filling downward beneath it.
  myPetSetCard: { width: "32%", minWidth: 0, alignSelf: "flex-start", paddingVertical: spacing.xs, paddingHorizontal: spacing.xxs, gap: spacing.xxs, alignItems: "center", justifyContent: "flex-start" },
  myPetSetTitle: { ...typography.label, color: colors.text, textAlign: "center" },
  myPetSetRow: { gap: spacing.none },
  myPetSetName: { ...typography.micro, color: colors.text, textAlign: "center" },
  myPetSetValue: { ...typography.micro, color: colors.accent, textAlign: "center" },
  myPetSpriteEffectOpen: { zIndex: layers.floatingPopover },
  myPetOverlayRow: { position: "absolute", left: 0, right: 0, top: 0, zIndex: layers.cardOverlay, height: iconSizes.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  myPetEffectButton: { width: iconSizes.lg, height: iconSizes.lg, alignItems: "center", justifyContent: "center", borderWidth: borders.none, borderRadius: radii.none, backgroundColor: colors.transparent },
  myPetEffectArrow: { width: slimeUi.effectArrow, height: slimeUi.effectArrow },
  myPetStarButton: { width: iconSizes.md, height: iconSizes.lg, alignItems: "center", justifyContent: "center", borderWidth: borders.none, borderRadius: radii.none, backgroundColor: colors.transparent },
  myPetEffectPopover: { position: "absolute", left: 0, top: iconSizes.lg + spacing.xxs, zIndex: layers.floatingPopover, width: slimeUi.effectPopoverWidth, padding: spacing.sm, gap: spacing.xxs, borderWidth: borders.hairline, borderColor: colors.border, borderRadius: radii.btn, backgroundColor: colors.surface, ...shadows.lift },
  myPetEffectPopoverTitle: { ...typography.micro, color: colors.text, fontWeight: "700" },
  myPetEffectPopoverRow: { gap: spacing.none },
  myPetEffectPopoverText: { ...typography.micro, color: colors.textMuted },
  myPetEffectPopoverValue: { ...typography.micro, color: colors.accentTintedText, fontWeight: "700" },
  myPetName: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
  myPetNameSelected: { color: colors.accentTintedText },
  // Above the sprite so the bar and its label stay legible, but below any open
  // popover. It previously borrowed the notice layer, which put it over popovers
  // and clipped the buff and growth panels behind the bar.
  myPetGrowth: { position: "relative", zIndex: layers.raisedContent, width: "100%", gap: spacing.xs, borderWidth: borders.none, borderRadius: radii.none, backgroundColor: colors.transparent },
  myPetGrowthMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xxs },
  myPetGrowthLabel: { ...typography.micro, color: colors.textMuted },
  myPetGrowthPercent: { ...typography.micro, color: colors.accentTintedText, fontVariant: ["tabular-nums"] },
  myPetGrowthTrack: { height: spacing.xs, overflow: "hidden", borderRadius: radii.pill, backgroundColor: colors.surfaceAlt },
  myPetGrowthFill: { height: "100%", borderRadius: radii.pill, backgroundColor: colors.accent },
  myPetGrowthPopover: { position: "absolute", left: 0, bottom: iconSizes.lg + spacing.xs, zIndex: layers.floatingPopover, width: slimeUi.growthPopoverWidth, padding: spacing.sm, gap: spacing.xxs, borderWidth: borders.hairline, borderColor: colors.border, borderRadius: radii.btn, backgroundColor: colors.surface, ...shadows.lift },
  myPetActions: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: spacing.xxs },
  appliedEffects: { width: "100%", gap: spacing.sm, paddingTop: spacing.sm },
  appliedEffectsTitle: { ...typography.label, color: colors.text },
  appliedEffectsList: { gap: spacing.xxs },
  appliedEffectRow: { minHeight: tapMin - spacing.md, paddingHorizontal: spacing.xs, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, backgroundColor: colors.transparent },
  appliedEffectLabel: { ...typography.micro, flex: 1, minWidth: 0, color: colors.textMuted },
  appliedEffectValue: { ...typography.micro, color: colors.accentTintedText, fontWeight: "700", textAlign: "right" },
  appliedEffectsEmpty: { ...typography.micro, color: colors.textMuted },
  myPetActionButton: { flex: 1, minWidth: 0, minHeight: tapMin - spacing.md, paddingHorizontal: spacing.xxs, paddingVertical: spacing.none, alignItems: "center", justifyContent: "center", borderWidth: borders.hairline, borderColor: colors.border, borderRadius: radii.btn, backgroundColor: colors.surface },
  myPetActionText: { ...typography.micro, color: colors.text, textAlign: "center", fontWeight: "700" },
  myPetCookieButton: { width: iconSizes.md + spacing.xl, minHeight: tapMin - spacing.md, flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xxs, borderWidth: borders.none, borderRadius: radii.none, backgroundColor: colors.transparent },
  myPetCookieIcon: { width: iconSizes.md, height: iconSizes.md },
  myPetCookieQuantity: { ...typography.micro, color: colors.accentTintedText, fontVariant: ["tabular-nums"] },
  myPetCookieQuantityDisabled: { color: colors.textFaint },
  unownedSprite: { width: iconSizes.empty, height: iconSizes.empty, alignItems: "center", justifyContent: "center" },
  unownedGlyph: { ...typography.section, color: colors.textFaint },
  floorList: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: spacing.sm },
  shopPage: { gap: spacing.sm },
  shopBalance: { ...typography.label, color: colors.accentTintedText, textAlign: "right", fontVariant: ["tabular-nums"] },
  shopTabs: { gap: spacing.xxs, paddingBottom: spacing.xs },
  shopTab: { minHeight: tapMin - spacing.lg, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, alignItems: "center", justifyContent: "center", borderRadius: spacing.xs, backgroundColor: colors.surface },
  shopTabSelected: { backgroundColor: colors.accentTintedBg },
  shopTabText: { ...typography.label, color: colors.textMuted },
  shopTabTextSelected: { color: colors.accentTintedText },
  shopContent: { paddingBottom: spacing.sm, gap: spacing.sm },
  floorRow: { width: "31%", minWidth: 0, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm, borderWidth: borders.hairline, borderColor: colors.border, borderRadius: radii.control, backgroundColor: colors.surface, alignItems: "center", justifyContent: "flex-start", gap: spacing.xs },
  shopPreview: { width: iconSizes.empty, height: iconSizes.empty, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: colors.surfaceAlt },
  // Scene backgrounds feather their edges to transparent, so a tinted tile behind
  // them shows through as a hard grey square outline. Those previews sit on the
  // page background instead; the feather itself provides the visual boundary.
  shopPreviewScene: { backgroundColor: colors.transparent },
  // Price bands stack down the page, so each band spans the full width and lays
  // its own items out in the same wrapping grid the ungrouped list used. Without
  // `width: "100%"` a band would be treated as one cell of the parent row and the
  // three bands would sit side by side.
  shopTierGroup: { width: "100%", gap: spacing.xs },
  // The outer list stacks bands vertically; the grid lives inside each band.
  shopTierList: { gap: spacing.sm },
  // No rule between bands; the gap and label carry the separation.
  shopTierLabel: { ...typography.micro, color: colors.textMuted },
  // Outfit slots are separated by a rule, one level above the price bands inside
  // them, so the two groupings stay visually distinguishable.
  shopOutfitDivider: { height: borders.hairline, marginTop: spacing.xs, marginBottom: spacing.xxs, backgroundColor: colors.border },
  shopOutfitLabel: { ...typography.section, color: colors.text },
  shopTierItems: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: spacing.sm },
  floorCopy: { width: "100%", minWidth: 0, alignItems: "center", gap: spacing.xxs },
  floorTitle: { ...typography.label, color: colors.text, textAlign: "center" },
  floorSubtitle: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
  floorStatus: { width: "100%", minHeight: tapMin, alignItems: "center", justifyContent: "center", gap: spacing.xxs },
  floorStatusText: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
  floorStatusBuy: { color: colors.accent },
  emptyCard: { width: "100%", padding: spacing.lg },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  // Opaque fill plus a hairline edge, since the notice now covers content rather
  // than tinting it.
  // Sits just above the bottom nav rather than a full tap target higher, so the
  // result of a tap appears near the thumb that made it. The nav already reserves
  // the safe area below itself, so a small gap is all that is needed here.
  notice: { position: "absolute", zIndex: layers.notice, bottom: spacing.sm, left: pageChrome.horizontalPadding, right: pageChrome.horizontalPadding, minHeight: tapMin, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.control, borderWidth: borders.hairline, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: spacing.sm, ...shadows.lift },
  // Opaque rather than tinted: the notice floats over the pet grid and shop list,
  // so a translucent fill let the content behind it show through.
  noticeSuccess: { backgroundColor: colors.noticeSuccessBg },
  noticeError: { backgroundColor: colors.noticeErrorBg },
  noticeIcon: { transform: [{ rotate: "90deg" }] },
  noticeText: { ...typography.label, flex: 1 },
  noticeSuccessText: { color: colors.plantActive },
  noticeErrorText: { color: colors.danger },
  wardrobeSheet: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  wardrobeTitle: { ...typography.title, color: colors.text },
  wardrobeNav: { width: "100%" },
  wardrobeNavItem: { flex: 1 },
  wardrobeList: { maxHeight: iconSizes.empty * 5 },
  wardrobeListContent: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: spacing.sm },
  wardrobeItem: { width: "31.5%", minWidth: 0, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm, borderWidth: borders.hairline, borderColor: colors.border, borderRadius: radii.control, backgroundColor: colors.surface, alignItems: "center", justifyContent: "flex-start", gap: spacing.xs },
  wardrobeItemEquipped: { borderColor: colors.accent, backgroundColor: colors.accentTintedBg },
  // Distinct from the equipped state: still selectable, but tapping moves the
  // piece off another pet rather than adding a new one.
  wardrobeItemWornByOther: { borderColor: colors.borderHover, backgroundColor: colors.surfaceAlt },
  wardrobeItemWornText: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
  wardrobeItemCopy: { width: "100%", minWidth: 0, alignItems: "center", gap: spacing.xxs },
  wardrobeItemAction: { ...typography.micro, color: colors.accentTintedText, textAlign: "center" },
  wardrobeItemActionEquipped: { color: colors.textMuted },
  walkingTitlePreview: { width: "100%", height: "100%" },
  classroomCard: { padding: spacing.xxl, alignItems: "center", gap: spacing.md },
  classroomEmoji: { fontSize: iconSizes.gate },
  classroomTitle: { ...typography.title, color: colors.text },
  classroomText: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  classroomState: { padding: spacing.xxl, alignItems: "center", gap: spacing.md },
  classroomList: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.xs },
  classmateCard: { width: "32%", minWidth: 0, padding: spacing.xs, alignItems: "center", gap: spacing.xxs, overflow: "hidden" },
  classmateName: { ...typography.micro, color: colors.text, alignSelf: "stretch", textAlign: "center" },
  classmateSprite: { height: iconSizes.empty + spacing.md, width: "100%", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  noRepresentative: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  classmatePlaceholderText: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
  classmateTitleSpacer: { width: "100%", height: spacing.xxl },
});
