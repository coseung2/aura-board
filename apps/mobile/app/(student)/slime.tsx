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
import { CircleAlert, CircleCheck, Star } from "lucide-react-native";
import {
  AppButton,
  AppHeader,
  BarePressable,
  ControlPressable,
} from "../../components/ui";
import {
  ContentTab,
  ContentTabs,
} from "../../components/NavigationTabs";
import {
  FeatheredSceneBackground,
  SlimeSprite,
} from "../../components/slime/SlimeSprite";
import { SlimePurchaseConfirmModal } from "../../components/slime/SlimePurchaseConfirmModal";
import { SlimeWardrobeSheet } from "../../components/slime/SlimeWardrobeSheet";
import {
  SlimeCharacterCatalogCard,
  SlimeShopItemCard,
} from "../../components/slime/SlimeShopCatalogCards";
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
import { resolveEquippedSlimePropAction } from "../../lib/slime-props";
import {
  buildSlimeShopOverviewSections,
  optimisticallyEquipSlimeItem,
  slimeWardrobeFilterForItem,
  slimeWardrobeItemWearerLabel,
  slimeWardrobeNavItems,
  type SlimeWardrobeFilter as WardrobeFilter,
} from "../../lib/slime-shop-presentation";
import {
  prioritizeEquippedSlimeItems,
  setSlimeItemHidden,
  visibleEquippedSlimeItemKeys,
} from "../../lib/slime-item-visibility";
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
type SlimeEquipResponse = Pick<
  MobileSlimeHome,
  | "equippedItemKeys"
  | "equippedItemsByColor"
  | "hiddenItemKeys"
  | "hiddenItemsByColor"
  | "equippedFloorByColor"
  | "equippedFloor"
>;
type SlimeCookieConsumeResponse = {
  itemKey: string;
  remainingQuantity: number;
  growth: NonNullable<MobileSlimeHome["growthByColor"][SlimeColor]>;
};
type SlimeVisibilityResponse = Pick<
  MobileSlimeHome,
  "hiddenItemKeys" | "hiddenItemsByColor"
> & {
  slimeColor: SlimeColor;
  itemKey: string;
  isHidden: boolean;
};
type LocalImageSource = ImageProps["source"];
const DISABLED_COOKIE_SOURCE = require("../../assets/slimes/shared/cookie-shop-icon-256-disabled.png");
const SLIME_TRAMPOLINE_ITEM_KEY = "slime-blue-trampoline";

const ERROR_LABELS: Record<string, string> = {
  insufficient_funds: "잔액이 부족해요.",
  already_owned: "이미 보유한 상품이에요.",
  unknown_item: "상품을 찾을 수 없어요.",
  not_owned: "먼저 상품을 구매해 주세요.",
  idempotency_key_reused: "같은 요청 키가 다른 상품에 사용됐어요. 다시 시도해 주세요.",
  account_not_found: "학생 지갑을 찾을 수 없어요.",
  invalid_body: "요청을 확인해 주세요.",
  request_timeout: "요청 시간이 초과됐어요. 다시 눌러 주세요.",
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

const SLIME_EFFECT_DESCRIPTIONS: Record<string, string> = {
  growth_speed: "펫의 성장 속도가 UP!",
  reading_reward: "독서로 얻을 수 있는 보상이 UP!",
  walking_reward: "걷기로 얻을 수 있는 보상이 UP!",
  assignment_reward: "과제 제출 날짜를 지켰을 때의 보상이 UP!",
  comment_reward: "게시물에 댓글을 달았을 때의 보상이 UP!",
};

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
  const [pendingPurchase, setPendingPurchase] = useState<SlimeShopItem | null>(null);
  const [busyColor, setBusyColor] = useState<SlimeColor | null>(null);
  const [busyRepresentative, setBusyRepresentative] = useState<SlimeColor | null>(null);
  const [shopFilter, setShopFilter] = useState<SlimeShopFilter>("all");
  const [wardrobeColor, setWardrobeColor] = useState<SlimeColor | null>(null);
  const [wardrobeFilter, setWardrobeFilter] = useState<WardrobeFilter>("floor");
  const [openEffectColor, setOpenEffectColor] = useState<SlimeColor | null>(null);
  const [openGrowthColor, setOpenGrowthColor] = useState<SlimeColor | null>(null);
  const [classmates, setClassmates] = useState<MobileSlimeClassmate[] | null>(null);
  const [classroomLoading, setClassroomLoading] = useState(false);
  const [classroomError, setClassroomError] = useState<string | null>(null);
  const retryKeysRef = useRef(new Map<string, string>());
  const homeRef = useRef<MobileSlimeHome | null>(null);
  const equipQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestEquipRequestRef = useRef(0);
  const buffRise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    homeRef.current = home;
  }, [home]);

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
      setShopFilter("all");
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
        const response = await apiFetch<unknown>("/api/student/slimes", {
          cacheTtlMs: 5 * 60_000,
          forceRefresh: isRefresh,
        });
        const nextHome = normalizeSlimeHome(response);
        homeRef.current = nextHome;
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
  const wardrobeTargetColor = wardrobeColor ?? selectedColor;
  const wardrobeEquippedItems = home?.equippedItemsByColor[wardrobeTargetColor] ?? [];
  const shopNavItems = useMemo(
    () => slimeShopNavItems(home?.shopCatalog ?? []),
    [home?.shopCatalog],
  );
  const wardrobeNavItems = useMemo(
    () => slimeWardrobeNavItems(home?.shopCatalog ?? []),
    [home?.shopCatalog],
  );
  const cookieQuantity = home?.ownedItemQuantities[SLIME_COOKIE_ITEM_KEY] ?? 0;
  const visibleShopItems = useMemo(
    () =>
      home?.shopCatalog.filter((item) =>
        shopFilter === "all"
          ? item.category !== "level-up"
          : shopFilterForItem(item) === shopFilter,
      ) ?? [],
    [home, shopFilter],
  );
  const shopOverviewSections = useMemo(
    () => buildSlimeShopOverviewSections(home?.catalog ?? [], home?.shopCatalog ?? []),
    [home?.catalog, home?.shopCatalog],
  );
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
    (itemKey: string): string | null =>
      home
        ? slimeWardrobeItemWearerLabel(
            itemKey,
            wardrobeTargetColor,
            home.equippedItemsByColor,
            SLIME_COLOR_LABELS,
          )
        : null,
    [home, wardrobeTargetColor],
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
  const renderShopItemCard = (item: SlimeShopItem) => (
    <SlimeShopItemCard
      key={item.key}
      item={item}
      selectedColor={selectedColor}
      unitLabel={home?.unitLabel ?? "원"}
      ownedItemKeys={home?.ownedItemKeys ?? []}
      ownedItemQuantities={home?.ownedItemQuantities ?? {}}
      busyItemKey={busyItemKey}
      onPress={confirmItemPurchase}
    />
  );

  const renderSlimeShopCard = (slime: SlimeCatalogItem) => (
    <SlimeCharacterCatalogCard
      key={slime.key}
      slime={slime}
      unitLabel={home?.unitLabel ?? "원"}
      ownedColors={home?.ownedColors ?? []}
      busyColor={busyColor}
      onPress={confirmSlimePurchase}
    />
  );

  const wardrobeItems = useMemo(
    () => home?.shopCatalog.filter((item) =>
      home.ownedItemKeys.includes(item.key)
      && item.category !== "food"
      && item.category !== "level-up",
    ) ?? [],
    [home],
  );
  const visibleWardrobeItems = useMemo(
    () => prioritizeEquippedSlimeItems(
      wardrobeItems.filter(
        (item) => slimeWardrobeFilterForItem(item) === wardrobeFilter,
      ),
      wardrobeEquippedItems,
    ),
    [wardrobeEquippedItems, wardrobeFilter, wardrobeItems],
  );
  const visibleWardrobeTitles = useMemo(() => {
    const equippedTitle = home?.equippedTitleByColor?.[wardrobeTargetColor];
    return prioritizeEquippedSlimeItems(
      home?.claimedTitles ?? [],
      equippedTitle ? [equippedTitle] : [],
    );
  }, [home?.claimedTitles, home?.equippedTitleByColor, wardrobeTargetColor]);
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

  const purchaseItem = useCallback(async (item: SlimeShopItem, quantity = 1) => {
    if (!home || busyItemKey) return;
    setBusyItemKey(item.key);
    setNotice(null);
    // The server compares the charged amount on replay, so a retry with a
    // different quantity must not reuse the previous request's key.
    const retryIdentity = `${item.key}:${quantity}`;
    try {
      await apiFetch("/api/student/slimes/items/purchase", {
        method: "POST",
        json: quantity > 1 ? { itemKey: item.key, quantity } : { itemKey: item.key },
        headers: { "Idempotency-Key": retryKey("slime-item-purchase", retryIdentity) },
      });
      clearRetryKey("slime-item-purchase", retryIdentity);
      setNotice({
        kind: "success",
        text: `${item.labelKo}${quantity > 1 ? ` ${quantity}개` : ""}를 구매했어요.`,
      });
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
    setPendingPurchase(item);
  }, []);

  const toggleItem = useCallback((item: SlimeShopItem) => {
    const currentHome = homeRef.current;
    if (
      !currentHome
      || !currentHome.ownedColors.includes(wardrobeTargetColor)
      || item.category === "food"
    ) return;
    const targetItems = currentHome.equippedItemsByColor[wardrobeTargetColor] ?? [];
    const isEquipped = !targetItems.includes(item.key);
    const requestVersion = latestEquipRequestRef.current + 1;
    latestEquipRequestRef.current = requestVersion;
    const optimisticHome = optimisticallyEquipSlimeItem(
      currentHome,
      wardrobeTargetColor,
      item,
      isEquipped,
    );
    homeRef.current = optimisticHome;
    setHome(optimisticHome);
    setBusyItemKey(item.key);
    setNotice(null);
    const retryIdentity = `${wardrobeTargetColor}:${item.key}:${isEquipped}`;

    const queuedRequest = equipQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        setBusyItemKey(item.key);
        try {
          const result = await apiFetch<SlimeEquipResponse>("/api/student/slimes/items/equip", {
            method: "POST",
            json: { itemKey: item.key, slimeColor: wardrobeTargetColor, isEquipped },
            timeoutMs: 15_000,
            headers: {
              "Idempotency-Key": retryKey("slime-item-equip", retryIdentity),
            },
          });
          clearRetryKey("slime-item-equip", retryIdentity);
          if (latestEquipRequestRef.current === requestVersion) {
            const reconciledHome = homeRef.current ? {
              ...homeRef.current,
              equippedItemKeys: result.equippedItemKeys,
              equippedItemsByColor: result.equippedItemsByColor,
              hiddenItemKeys: result.hiddenItemKeys,
              hiddenItemsByColor: result.hiddenItemsByColor,
              equippedFloorByColor: result.equippedFloorByColor,
              equippedFloor: result.equippedFloor,
            } : null;
            homeRef.current = reconciledHome;
            setHome(reconciledHome);
            setNotice({
              kind: "success",
              text: `${item.labelKo}를 ${isEquipped ? "적용" : "해제"}했어요.`,
            });
          }
        } catch (mutationError) {
          if (latestEquipRequestRef.current === requestVersion) {
            setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
            await load(true);
          }
        } finally {
          if (latestEquipRequestRef.current === requestVersion) {
            setBusyItemKey(null);
          }
        }
      });
    equipQueueRef.current = queuedRequest;
  }, [clearRetryKey, load, retryKey, wardrobeTargetColor]);

  const toggleItemVisibility = useCallback((item: SlimeShopItem, isCurrentlyHidden: boolean) => {
    const currentHome = homeRef.current;
    const equipped = currentHome?.equippedItemsByColor[wardrobeTargetColor] ?? [];
    if (!currentHome || !equipped.includes(item.key)) return;

    const isHidden = !isCurrentlyHidden;
    const requestVersion = latestEquipRequestRef.current + 1;
    latestEquipRequestRef.current = requestVersion;
    const hiddenItemsByColor = setSlimeItemHidden(
      currentHome.hiddenItemsByColor,
      wardrobeTargetColor,
      item.key,
      isHidden,
    );
    const optimisticHome: MobileSlimeHome = {
      ...currentHome,
      hiddenItemsByColor: Object.fromEntries(
        Object.entries(hiddenItemsByColor).map(([color, keys]) => [color, [...(keys ?? [])]]),
      ),
      hiddenItemKeys: Array.from(new Set(
        Object.values(hiddenItemsByColor).flatMap((keys) => [...(keys ?? [])]),
      )),
    };
    homeRef.current = optimisticHome;
    setHome(optimisticHome);
    setBusyItemKey(item.key);
    setNotice(null);
    const retryIdentity = `${wardrobeTargetColor}:${item.key}:${isHidden}`;

    const queuedRequest = equipQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        setBusyItemKey(item.key);
        try {
          const result = await apiFetch<SlimeVisibilityResponse>(
            "/api/student/slimes/items/visibility",
            {
              method: "POST",
              json: { itemKey: item.key, slimeColor: wardrobeTargetColor, isHidden },
              timeoutMs: 15_000,
              headers: {
                "Idempotency-Key": retryKey("slime-item-visibility", retryIdentity),
              },
            },
          );
          clearRetryKey("slime-item-visibility", retryIdentity);
          if (latestEquipRequestRef.current === requestVersion) {
            const reconciledHome = homeRef.current ? {
              ...homeRef.current,
              hiddenItemKeys: result.hiddenItemKeys,
              hiddenItemsByColor: result.hiddenItemsByColor,
            } : null;
            homeRef.current = reconciledHome;
            setHome(reconciledHome);
            setNotice({
              kind: "success",
              text: `${item.labelKo} 외형을 ${isHidden ? "숨겼어요. 버프는 계속 적용돼요." : "다시 표시했어요."}`,
            });
          }
        } catch (mutationError) {
          if (latestEquipRequestRef.current === requestVersion) {
            setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
            await load(true);
          }
        } finally {
          if (latestEquipRequestRef.current === requestVersion) setBusyItemKey(null);
        }
      });
    equipQueueRef.current = queuedRequest;
  }, [clearRetryKey, load, retryKey, wardrobeTargetColor]);

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
      const result = await apiFetch<SlimeCookieConsumeResponse>("/api/student/slimes/items/consume", {
        method: "POST",
        json: { itemKey: SLIME_COOKIE_ITEM_KEY, color },
        timeoutMs: 15_000,
        headers: {
          "Idempotency-Key": retryKey("slime-cookie-use", color),
        },
      });
      clearRetryKey("slime-cookie-use", color);
      setHome((current) => current ? {
        ...current,
        ownedItemQuantities: {
          ...current.ownedItemQuantities,
          [SLIME_COOKIE_ITEM_KEY]: result.remainingQuantity,
        },
        growthByColor: {
          ...current.growthByColor,
          [color]: result.growth,
        },
      } : current);
      setManualActions((current) => ({ ...current, [color]: "happy" }));
      setNotice({ kind: "success", text: `${SLIME_COLOR_LABELS[color]} 슬라임에게 쿠키를 먹였어요.` });
    } catch (mutationError) {
      setNotice({ kind: "error", text: apiErrorMessage(mutationError) });
    } finally {
      setBusyItemKey(null);
    }
  }, [busyItemKey, clearRetryKey, cookieQuantity, home, retryKey]);

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
                const classVisibleItemKeys = representative
                  ? visibleEquippedSlimeItemKeys(
                      representative.equippedItemKeys,
                      representative.hiddenItemKeys,
                    )
                  : [];
                const classItems = representative
                  ? home?.shopCatalog.filter((item) =>
                      classVisibleItemKeys.includes(item.key),
                    ) ?? []
                  : [];
                const classFloor = classItems.reduce<EquippedFloor>(
                  (current, item) => item.floor ?? current,
                  "none",
                );
                const classVehicleItem = representative
                  ? resolveEquippedVehicle(
                      classVisibleItemKeys,
                      home?.shopCatalog ?? [],
                    )
                  : null;
                const classUsesTrampoline =
                  classVehicleItem?.key === SLIME_TRAMPOLINE_ITEM_KEY;
                const classRenderedVehicle = classUsesTrampoline ? null : classVehicleItem;
                const classAction: SlimeAction = classUsesTrampoline
                    ? "floor-interaction"
                    : "idle";
                const classPropAction = representative
                  ? resolveEquippedSlimePropAction(
                      classVisibleItemKeys,
                      home?.shopCatalog ?? [],
                    )
                  : null;
                const classWearables = representative
                  ? resolveEquippedSlimeWearables(
                      classVisibleItemKeys,
                      home?.shopCatalog ?? [],
                    )
                  : null;
                const classBackground = representative
                  ? resolveEquippedSceneBackground(
                      classVisibleItemKeys,
                      home?.shopCatalog ?? [],
                    )
                  : null;
                return (
                  <View key={student.id} style={styles.classmateCard}>
                    <View
                      style={[
                        styles.classmateSprite,
                        styles.vehicleSceneSlot,
                      ]}
                    >
                      {classBackground ? (
                        <FeatheredSceneBackground
                          spritePath={selectSceneBackgroundSpritePath(classBackground)}
                          style={StyleSheet.absoluteFill}
                        />
                      ) : null}
                      {representative ? (
                          <SlimeSprite
                            slimeColor={representative.color}
                            growthStage={representative.growthStage}
                            action={classAction}
                            equippedFloor={classUsesTrampoline ? "trampoline" : classFloor}
                            displayScale={slimeUi.petSceneDisplayScale}
                            expandSceneSurfaces
                            repeat={Boolean(classPropAction) || classAction !== "idle"}
                            propAction={classPropAction}
                            wearables={classWearables ?? undefined}
                            drinkFlavor={classWearables?.drink}
                            vehicleSpritePath={
                              classRenderedVehicle?.vehicleSheetPath ?? classRenderedVehicle?.spritePath
                            }
                            vehicleGroundedSpritePath={classRenderedVehicle?.vehicleGroundedSpritePath}
                            vehicleEffectSpritePaths={classRenderedVehicle?.vehicleEffectSpritePaths}
                            vehicleFrameCount={classRenderedVehicle?.vehicleFrameCount}
                            vehicleGroundedFrameCount={classRenderedVehicle?.vehicleGroundedFrameCount}
                            vehicleGroundedFrameDurationMs={classRenderedVehicle?.vehicleGroundedFrameDurationMs}
                            vehicleCanvasHeight={classRenderedVehicle?.vehicleCanvasHeight}
                            vehicleCharacterOffsetY={classRenderedVehicle?.vehicleCharacterOffsetY}
                            vehicleBobY={classRenderedVehicle?.vehicleBobY}
                            vehicleRiseY={classRenderedVehicle?.vehicleRiseY}
                            vehicleOffsetX={classRenderedVehicle?.vehicleOffsetX}
                            accessibilityLabel={`${student.name}의 ${SLIME_COLOR_LABELS[representative.color]} 대표 펫`}
                          />
                      ) : (
                        <View style={styles.noRepresentative}>
                          <Text style={styles.classmatePlaceholderText}>대표 펫 미지정</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.classmateBody}>
                      {student.walkingTitle ? (
                        <WalkingTitleSlot title={student.walkingTitle} />
                      ) : (
                        <View style={styles.classmateTitleSpacer} />
                      )}
                      <Text style={styles.classmateName} numberOfLines={1}>
                        {student.number !== null ? `${student.number}번 ` : ""}{student.name}
                      </Text>
                    </View>
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
            const petVisibleItems = visibleEquippedSlimeItemKeys(
              petItems,
              home?.hiddenItemsByColor[itemColor],
            );
            const petWearables = resolveEquippedSlimeWearables(
              petVisibleItems,
              home?.shopCatalog ?? [],
            );
            const petFloor = petVisibleItems.reduce<EquippedFloor>(
              (current, itemKey) =>
                home?.shopCatalog.find((item) => item.key === itemKey)?.floor ?? current,
              "none",
            );
            const petBackground = resolveEquippedSceneBackground(
              petVisibleItems,
              home?.shopCatalog ?? [],
            );
            const petPropAction = resolveEquippedSlimePropAction(
              petVisibleItems,
              home?.shopCatalog ?? [],
            );
            const petVehicle = resolveEquippedVehicle(
              petVisibleItems,
              home?.shopCatalog ?? [],
            );
            const petUsesTrampoline = petVehicle?.key === SLIME_TRAMPOLINE_ITEM_KEY;
            const petRenderedVehicle = petUsesTrampoline ? null : petVehicle;
            const petHasDrink = (home?.shopCatalog ?? []).some(
              (item) => item.category === "drink" && petVisibleItems.includes(item.key),
            );
            const manualAction = manualActions[itemColor];
            const petAction: SlimeAction = manualAction
              ? manualAction
              : petHasDrink
                ? "drink"
                : // The trampoline is a vehicle now, so its jump timeline is keyed
                  // off the equipped vehicle rather than a floor value.
                  petUsesTrampoline
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
                  styles.vehicleSceneSlot,
                  openEffectColor === itemColor && styles.myPetSpriteEffectOpen,
                ]}>
                  {petBackground ? (
                    <FeatheredSceneBackground
                      spritePath={selectSceneBackgroundSpritePath(petBackground)}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : null}
                  {isOwned ? (
                    <>
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
                      equippedFloor={petUsesTrampoline ? "trampoline" : petFloor}
                      displayScale={slimeUi.petSceneDisplayScale}
                      expandSceneSurfaces
                      repeat={!manualAction && (Boolean(petPropAction) || petAction !== "idle")}
                      propAction={petPropAction}
                      wearables={petWearables}
                      drinkFlavor={petWearables.drink}
                      vehicleSpritePath={petRenderedVehicle?.vehicleSheetPath ?? petRenderedVehicle?.spritePath}
                      vehicleGroundedSpritePath={petRenderedVehicle?.vehicleGroundedSpritePath}
                      vehicleEffectSpritePaths={petRenderedVehicle?.vehicleEffectSpritePaths}
                      vehicleFrameCount={petRenderedVehicle?.vehicleFrameCount}
                      vehicleGroundedFrameCount={petRenderedVehicle?.vehicleGroundedFrameCount}
                      vehicleGroundedFrameDurationMs={petRenderedVehicle?.vehicleGroundedFrameDurationMs}
                      vehicleCanvasHeight={petRenderedVehicle?.vehicleCanvasHeight}
                      vehicleCharacterOffsetY={petRenderedVehicle?.vehicleCharacterOffsetY}
                      vehicleBobY={petRenderedVehicle?.vehicleBobY}
                      vehicleRiseY={petRenderedVehicle?.vehicleRiseY}
                      vehicleOffsetX={petRenderedVehicle?.vehicleOffsetX}
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
                <View style={styles.myPetNameRow}>
                  {isOwned ? (
                    <View style={styles.myPetNameActionSlot} pointerEvents="box-none">
                      <ControlPressable
                        style={styles.myPetEffectButton}
                        onPress={() => {
                          setOpenGrowthColor(null);
                          setOpenEffectColor((current) => current === itemColor ? null : itemColor);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 슬라임 버프 상세 보기`}
                        accessibilityState={{ expanded: openEffectColor === itemColor }}
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
                    </View>
                  ) : null}
                  <Text style={[styles.myPetName, selected && styles.myPetNameSelected]}>{SLIME_COLOR_LABELS[itemColor]}</Text>
                  {isOwned ? (
                    <View style={styles.myPetNameActionSlot} pointerEvents="box-none">
                      <ControlPressable
                        style={styles.myPetStarButton}
                        disabled={busyRepresentative !== null || home?.representativeColor === itemColor}
                        onPress={() => void setRepresentative(itemColor)}
                        accessibilityRole="button"
                        accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 슬라임을 대표로 지정`}
                        accessibilityState={{ selected: home?.representativeColor === itemColor, busy: busyRepresentative === itemColor }}
                      >
                        <Star
                          size={iconSizes.sm}
                          color={home?.representativeColor === itemColor ? colors.warning : colors.textFaint}
                          fill={home?.representativeColor === itemColor ? colors.warning : colors.textFaint}
                          accessible={false}
                        />
                      </ControlPressable>
                    </View>
                  ) : null}
                </View>
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
                  <BarePressable
                    style={styles.myPetActionLink}
                    disabled={!isOwned}
                    hitSlop={spacing.sm}
                    onPress={() => {
                      setOpenEffectColor(null);
                      setOpenGrowthColor(null);
                      setSelectedColor(itemColor);
                      setWardrobeColor(itemColor);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 꾸미기`}
                  >
                    <Text style={styles.myPetActionText}>꾸미기</Text>
                  </BarePressable>
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
                  <Text
                    style={styles.appliedEffectDescription}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {SLIME_EFFECT_DESCRIPTIONS[effect.effectKey] ?? ""}
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
        <ContentTabs style={styles.shopNav} accessibilityLabel="상점 상품 카테고리">
          {shopNavItems.map((tab) => (
            <ContentTab
              key={tab.key}
              style={styles.shopNavItem}
              selected={shopFilter === tab.key}
              onPress={() => setShopFilter(tab.key)}
            >
              {tab.label}
            </ContentTab>
          ))}
        </ContentTabs>
        <View style={styles.shopContent}>
        {shopFilter === "all" ? (
          <View style={styles.shopOverview} accessibilityLabel="전체 상품">
            {shopOverviewSections.map((overviewSection) => (
              <View key={overviewSection.key} style={styles.shopOverviewSection}>
                <Text style={styles.shopOverviewHeading}>
                  {overviewSection.label}
                </Text>
                <View style={styles.shopTierItems}>
                  {overviewSection.characters.map(renderSlimeShopCard)}
                  {overviewSection.items.map(renderShopItemCard)}
                </View>
              </View>
            ))}
          </View>
        ) : shopFilter === "character" ? (
          <View style={styles.floorList}>
            {home?.catalog.map(renderSlimeShopCard)}
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
        hiddenItemKeys={
          home?.hiddenItemsByColor[wardrobeTargetColor] ?? []
        }
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
            if (busyItemKey !== pendingPurchase.key) setPendingPurchase(null);
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
          style={[styles.notice, notice.kind === "error" ? styles.noticeError : styles.noticeSuccess]}
          accessibilityRole="alert"
        >
          {notice.kind === "error" ? (
            <CircleAlert size={iconSizes.sm} color={colors.danger} style={styles.noticeIcon} accessible={false} />
          ) : (
            <CircleCheck size={iconSizes.sm} color={colors.plantActive} style={styles.noticeIcon} accessible={false} />
          )}
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
    paddingBottom: spacing.xs,
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
  // The sprite slot already carries transparent bottom pixels (and a taller
  // vehicle scene carries more). Compensate below the name so the visible
  // sprite -> name and name -> growth gaps read evenly on-device rather than
  // merely sharing the same flex `gap` value.
  myPetNameRow: { width: "100%", minHeight: iconSizes.md, marginBottom: spacing.xs, flexDirection: "row", alignItems: "center" },
  myPetNameActionSlot: { position: "relative", width: iconSizes.lg, height: iconSizes.md },
  myPetEffectButton: { position: "absolute", left: (iconSizes.lg - tapMin) / 2, top: (iconSizes.md - tapMin) / 2, zIndex: layers.cardOverlay, width: tapMin, height: tapMin, alignItems: "center", justifyContent: "center", borderWidth: borders.none, borderRadius: radii.none, backgroundColor: colors.transparent },
  myPetEffectArrow: { width: slimeUi.effectArrow, height: slimeUi.effectArrow },
  myPetStarButton: { position: "absolute", left: (iconSizes.lg - tapMin) / 2, top: (iconSizes.md - tapMin) / 2, zIndex: layers.cardOverlay, width: tapMin, height: tapMin, alignItems: "center", justifyContent: "center", borderWidth: borders.none, borderRadius: radii.none, backgroundColor: colors.transparent },
  myPetEffectPopover: { position: "absolute", left: 0, top: iconSizes.lg + spacing.xxs, zIndex: layers.floatingPopover, width: slimeUi.effectPopoverWidth, padding: spacing.sm, gap: spacing.xxs, borderWidth: borders.hairline, borderColor: colors.border, borderRadius: radii.btn, backgroundColor: colors.surface, ...shadows.lift },
  myPetEffectPopoverTitle: { ...typography.micro, color: colors.text, fontWeight: "700" },
  myPetEffectPopoverRow: { gap: spacing.none },
  myPetEffectPopoverText: { ...typography.micro, color: colors.textMuted },
  myPetEffectPopoverValue: { ...typography.micro, color: colors.accentTintedText, fontWeight: "700" },
  myPetName: { ...typography.micro, flex: 1, minWidth: 0, color: colors.textMuted, textAlign: "center" },
  myPetNameSelected: { color: colors.accentTintedText },
  // Above the sprite so the bar and its label stay legible, but below any open
  // popover. It previously borrowed the notice layer, which put it over popovers
  // and clipped the buff and growth panels behind the bar.
  myPetGrowth: { position: "relative", zIndex: layers.raisedContent, width: "100%", minHeight: spacing.none, gap: spacing.xs, borderWidth: borders.none, borderRadius: radii.none, backgroundColor: colors.transparent },
  myPetGrowthMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.xxs },
  myPetGrowthLabel: { ...typography.micro, color: colors.textMuted },
  myPetGrowthPercent: { ...typography.micro, color: colors.accentTintedText, fontVariant: ["tabular-nums"] },
  myPetGrowthTrack: { height: spacing.xs, overflow: "hidden", borderRadius: radii.pill, backgroundColor: colors.surfaceAlt },
  myPetGrowthFill: { height: "100%", borderRadius: radii.pill, backgroundColor: colors.accent },
  myPetGrowthPopover: { position: "absolute", left: 0, bottom: iconSizes.lg + spacing.xs, zIndex: layers.floatingPopover, width: slimeUi.growthPopoverWidth, padding: spacing.sm, gap: spacing.xxs, borderWidth: borders.hairline, borderColor: colors.border, borderRadius: radii.btn, backgroundColor: colors.surface, ...shadows.lift },
  myPetActions: { width: "100%", marginTop: -spacing.xxs, flexDirection: "row", flexWrap: "wrap", gap: spacing.xxs },
  appliedEffects: { width: "100%", gap: spacing.sm, paddingTop: spacing.sm },
  appliedEffectsTitle: { ...typography.label, color: colors.text },
  appliedEffectsList: { gap: spacing.xxs },
  appliedEffectRow: { minHeight: tapMin - spacing.md, paddingHorizontal: spacing.xs, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, backgroundColor: colors.transparent },
  appliedEffectLabel: { ...typography.micro, width: iconSizes.empty - spacing.sm, flexShrink: 0, color: colors.text, fontWeight: "700" },
  appliedEffectDescription: { ...typography.micro, flex: 1, minWidth: 0, color: colors.textMuted, textAlign: "left" },
  appliedEffectValue: { ...typography.micro, width: iconSizes.lg + spacing.xs, flexShrink: 0, color: colors.accentTintedText, fontWeight: "700", textAlign: "right" },
  appliedEffectsEmpty: { ...typography.micro, color: colors.textMuted },
  myPetActionLink: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center" },
  myPetActionText: { ...typography.micro, color: colors.accentTintedText, textAlign: "center", fontWeight: "700" },
  myPetCookieButton: { width: iconSizes.md + spacing.xl, minHeight: tapMin - spacing.md, flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xxs, borderWidth: borders.none, borderRadius: radii.none, backgroundColor: colors.transparent },
  myPetCookieIcon: { width: iconSizes.md, height: iconSizes.md },
  myPetCookieQuantity: { ...typography.micro, color: colors.accentTintedText, fontVariant: ["tabular-nums"] },
  myPetCookieQuantityDisabled: { color: colors.textFaint },
  unownedSprite: { width: iconSizes.empty, height: iconSizes.empty, alignItems: "center", justifyContent: "center" },
  unownedGlyph: { ...typography.section, color: colors.textFaint },
  floorList: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: spacing.sm },
  shopPage: { gap: spacing.sm },
  shopBalance: { ...typography.label, color: colors.accentTintedText, textAlign: "right", fontVariant: ["tabular-nums"] },
  shopNav: { width: "100%" },
  shopNavItem: { flex: 1, paddingHorizontal: spacing.xxs },
  shopContent: { paddingBottom: spacing.sm, gap: spacing.sm },
  shopOverview: { gap: spacing.lg },
  shopOverviewSection: { width: "100%", gap: spacing.sm },
  shopOverviewHeading: { ...typography.section, color: colors.text },
  floorRow: { width: "31.5%", minWidth: 0, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, borderWidth: borders.hairline, borderColor: colors.border, borderRadius: radii.control, backgroundColor: colors.surface, alignItems: "center", justifyContent: "flex-start", gap: spacing.xxs },
  vehicleSceneSlot: { position: "relative", height: slimeUi.vehicleSceneSlotHeight, overflow: "hidden" },
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
  noticeIcon: { flexShrink: 0 },
  noticeText: { ...typography.label, flex: 1 },
  noticeSuccessText: { color: colors.plantActive },
  noticeErrorText: { color: colors.danger },
  classroomCard: { padding: spacing.xxl, alignItems: "center", gap: spacing.md },
  classroomEmoji: { fontSize: iconSizes.gate },
  classroomTitle: { ...typography.title, color: colors.text },
  classroomText: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  classroomState: { padding: spacing.xxl, alignItems: "center", gap: spacing.md },
  classroomList: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.xs },
  classmateCard: { width: "32%", minWidth: 0, paddingHorizontal: spacing.none, paddingVertical: spacing.xs, alignItems: "center", gap: spacing.xxs, overflow: "hidden" },
  classmateBody: { width: "100%", paddingHorizontal: spacing.xs, alignItems: "center", gap: spacing.xxs },
  classmateName: { ...typography.micro, color: colors.text, alignSelf: "stretch", textAlign: "center" },
  classmateSprite: { height: iconSizes.empty + spacing.md, width: "100%", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  noRepresentative: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  classmatePlaceholderText: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
  classmateTitleSpacer: { width: "100%", height: spacing.xxl },
});
