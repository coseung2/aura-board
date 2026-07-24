import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  SLIME_ASSET_COLORS,
  SLIME_SHARED_ASSETS,
  type EquippedFloor,
  type SlimeAction,
  type SlimeColor,
} from "../../lib/slime-assets";
import {
  evolutionForStage,
  calculateGrowthTimeComparison,
  calculateSlimeGrowthPercent,
  floorLabel,
  formatGrowthHours,
  newSlimeIdempotencyKey,
  normalizeSlimeClassroom,
  normalizeSlimeHome,
  shopFilterForItem,
  slimeBuffBpsForStage,
  slimeBallSpritePath,
  SLIME_COOKIE_ITEM_KEY,
  SLIME_COLOR_LABELS,
  SLIME_STAGE_LABELS,
  SLIME_SHOP_NAV_ITEMS,
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
type WardrobeFilter = "floor" | "drink" | "prop" | "title";

const DISABLED_COOKIE_SOURCE = require("../../assets/slimes/shared/cookie-shop-icon-256-disabled.png");

const WARDROBE_NAV_ITEMS: readonly { key: WardrobeFilter; label: string }[] = [
  { key: "floor", label: "바닥" },
  { key: "drink", label: "음료" },
  { key: "prop", label: "소품" },
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
  if (item.floor || item.category === "background" || item.category === "ride") return "floor";
  if (item.category === "drink") return "drink";
  return "prop";
}

function shopItemSpritePath(item: SlimeShopItem, slimeColor: SlimeColor): string {
  if (!item.key.startsWith("slime-ball-")) return item.spritePath;
  return slimeBallSpritePath([item.key], slimeColor) ?? item.spritePath;
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
  const lemonade = home?.shopCatalog.find((item) => item.category === "drink");
  const equippedItems = home?.equippedItemsByColor[selectedColor] ?? [];
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
  const appliedEffects = useMemo(() => {
    if (!home) return [];
    const serverEffects = Array.isArray(home.effects?.breakdown)
      ? home.effects.breakdown
      : [];
    // 슬라임 자체 버프는 장착 여부와 무관하게, 보유한 슬라임 전체가
    // 적용된다. 서버의 보상·성장 계산과 같은 기준을 사용한다.
    const activeColors = home.ownedColors;
    const slimeEffects = activeColors.flatMap((color) => {
      const slime = home.catalog.find((entry) => entry.color === color);
      if (!slime) return [];
      return [{
        source: "slime",
        key: slime.key,
        label: slime.nameKo,
        effectKey: slime.effectKey,
        bps: slimeBuffBpsForStage(slime.baseBuffBps, stageForColor(home, color)),
      }];
    });
    return [
      ...slimeEffects,
      ...serverEffects.filter((effect) => effect.source !== "slime"),
    ];
  }, [home]);
  const appliedGrowthSpeedBps = appliedEffects
    .filter((effect) => effect.effectKey === "growth_speed")
    .reduce((total, effect) => total + effect.bps, 0);
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

  if (loading && !home) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <AppHeader title="슬라임" onBack={() => router.back()} />
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>펫 화면으로 이동 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !home) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <AppHeader title="슬라임" onBack={() => router.back()} />
        <View style={styles.errorCenter}>
          <Text style={styles.errorEmoji}>🫧</Text>
          <Text style={styles.errorTitle}>펫 화면을 열 수 없어요</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <AppButton onPress={() => void load()}>다시 시도</AppButton>
        </View>
      </SafeAreaView>
    );
  }

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
      <AppHeader title="펫" onBack={() => router.back()} right={<StudentHeaderActions />} />
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
                const classAction: SlimeAction = classItems.some(
                  (item) => item.category === "drink",
                )
                  ? "drink"
                  : classFloor === "water-puddle" || classFloor === "trampoline"
                    ? "floor-interaction"
                    : "idle";
                const classBallSpritePath = representative
                  ? slimeBallSpritePath(representative.equippedItemKeys, representative.color)
                  : undefined;
                return (
                  <View key={student.id} style={styles.classmateCard}>
                    <View style={styles.classmateSprite}>
                      {representative ? (
                          <SlimeSprite
                            slimeColor={representative.color}
                            evolution={evolutionForStage(representative.growthStage)}
                            action={classAction}
                            equippedFloor={classFloor}
                            displayScale={0.25}
                            repeat={classAction !== "idle"}
                            itemSpritePath={classBallSpritePath}
                            accessibilityLabel={`${student.name}의 ${SLIME_COLOR_LABELS[representative.color]} 대표 펫`}
                          />
                      ) : (
                        <View style={styles.noRepresentative}>
                          <Text style={styles.classmatePlaceholderText}>대표 펫 미지정</Text>
                        </View>
                      )}
                    </View>
                    <WalkingTitleSlot title={student.walkingTitle} />
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
          {SLIME_ASSET_COLORS.map((itemColor) => {
            const isOwned = home?.ownedColors.includes(itemColor) ?? false;
            const selected = selectedColor === itemColor;
            const petStage = home ? stageForColor(home, itemColor) : 1;
            const growth = home?.growthByColor[itemColor];
            const growthPercent = growth ? calculateSlimeGrowthPercent(growth) : 0;
            const growthTime = growth
              ? calculateGrowthTimeComparison(growth.remainingSeconds, appliedGrowthSpeedBps)
              : null;
            const catalogItem = home?.catalog.find((entry) => entry.color === itemColor);
            const effectPercent = slimeBuffBpsForStage(
              catalogItem?.baseBuffBps ?? 0,
              petStage,
            ) / 100;
            const effectLabel = SLIME_EFFECT_LABELS[catalogItem?.effectKey ?? ""] ?? "기본 효과";
            const petItems = home?.equippedItemsByColor[itemColor] ?? [];
            const petFloor = home?.equippedFloorByColor[itemColor] ?? "none";
            const petHasDrink = Boolean(lemonade && petItems.includes(lemonade.key));
            const manualAction = manualActions[itemColor];
            const petAction: SlimeAction = manualAction
              ? manualAction
              : petHasDrink
                ? "drink"
                : petFloor === "water-puddle" || petFloor === "trampoline"
                  ? "floor-interaction"
                  : "idle";
            return (
              <View
                key={itemColor}
                style={[
                  styles.myPetCard,
                  !isOwned && styles.myPetCardDisabled,
                  (openEffectColor === itemColor || openGrowthColor === itemColor) && styles.myPetCardEffectOpen,
                ]}
              >
                <View style={styles.myPetSprite}>
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
                          <Text style={styles.myPetEffectPopoverText}>
                            {effectLabel} +{effectPercent}%
                          </Text>
                        </View>
                      ) : null}
                    </>
                  ) : null}
                  {isOwned ? (
                    <SlimeSprite
                      slimeColor={itemColor}
                      evolution={evolutionForStage(petStage)}
                      action={petAction}
                      equippedFloor={petFloor}
                      displayScale={0.25}
                      repeat={!manualAction && petAction !== "idle"}
                      itemSpritePath={slimeBallSpritePath(petItems, itemColor)}
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
            );
          })}
        </View>
        <View style={styles.appliedEffects} accessibilityLabel="적용 중인 버프 목록">
          <Text style={styles.appliedEffectsTitle}>적용 중인 버프</Text>
          {appliedEffects.length ? (
            <View style={styles.appliedEffectsList}>
              {appliedEffects.map((effect) => (
                <View key={`${effect.source}:${effect.key}`} style={styles.appliedEffectRow}>
                  <Text style={styles.appliedEffectLabel} numberOfLines={1}>{effect.label}</Text>
                  <Text style={styles.appliedEffectValue}>
                    {SLIME_EFFECT_LABELS[effect.effectKey] ?? effect.effectKey} +{effect.bps / 100}%
                  </Text>
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
          {SLIME_SHOP_NAV_ITEMS.map((tab) => (
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
        ) : shopFilter === "floor" ? (
        <View style={styles.floorList} accessibilityLabel="바닥 인벤토리">
          {floorItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>바닥 상품을 준비 중이에요.</Text>
            </View>
          ) : (
            floorItems.map((item) => {
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
                      slimeColor={selectedColor}
                      evolution="base"
                      action="idle"
                      equippedFloor="none"
                      displayScale={0.25}
                      itemSpritePath={shopItemSpritePath(item, selectedColor)}
                      accessibilityLabel={`${item.labelKo || floorLabel(floor)} 미리보기`}
                    />
                  </View>
                  <View style={styles.floorCopy}>
                    <Text style={styles.floorTitle}>{item.labelKo || floorLabel(floor)}</Text>
                    <Text style={styles.floorSubtitle}>{floorLabel(floor)}</Text>
                  </View>
                  <View style={styles.floorStatus}>
                    {busy ? <ActivityIndicator size="small" color={colors.accent} /> : null}
                    <Text style={[styles.floorStatusText, !ownedItem && styles.floorStatusBuy]}>{status}</Text>
                  </View>
                </ControlPressable>
              );
            })
          )}
        </View>
        ) : (
          <View style={styles.floorList}>
            {visibleShopItems.length === 0 ? (
              <View style={styles.emptyCard}><Text style={styles.emptyText}>이 분류에는 상품이 없어요.</Text></View>
            ) : visibleShopItems.map((item) => {
              const quantity = home?.ownedItemQuantities[item.key] ?? 0;
              const repeatable = item.key === SLIME_COOKIE_ITEM_KEY;
              const ownedItem = repeatable ? quantity > 0 : home?.ownedItemKeys.includes(item.key) ?? false;
              const busy = busyItemKey === item.key;
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
                      slimeColor={selectedColor}
                      evolution="base"
                      action="idle"
                      equippedFloor="none"
                      displayScale={0.25}
                      itemSpritePath={shopItemSpritePath(item, selectedColor)}
                      accessibilityLabel={`${item.labelKo} 미리보기`}
                    />
                  </View>
                  <View style={styles.floorCopy}>
                    <Text style={styles.floorTitle}>{item.labelKo}</Text>
                    {repeatable || !ownedItem ? (
                      <Text style={styles.floorSubtitle}>
                        {repeatable ? `${quantity}개 보유` : `${item.price.toLocaleString()}${home?.unitLabel ?? "원"}`}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.floorStatusText, (repeatable || !ownedItem) && styles.floorStatusBuy]}>{busy ? "처리 중…" : repeatable ? "구매" : ownedItem ? "보유 중" : "구매"}</Text>
                </ControlPressable>
              );
            })}
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
          {WARDROBE_NAV_ITEMS.map((item) => (
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
            home?.walkingTitle ? (
              <View style={styles.wardrobeItem} accessibilityLabel={`${home.walkingTitle.label} 칭호 적용 중`}>
                <View style={styles.shopPreview} accessible={false}>
                  <Image
                    source={{ uri: `${getApiBase()}${home.walkingTitle.imagePath}` }}
                    style={styles.walkingTitlePreview}
                    contentFit="contain"
                    accessibilityLabel={`${home.walkingTitle.label} 칭호`}
                  />
                </View>
                <View style={styles.wardrobeItemCopy}>
                  <Text style={styles.floorTitle}>{home.walkingTitle.label}</Text>
                  <Text style={styles.floorSubtitle}>칭호</Text>
                </View>
                <Text style={styles.wardrobeItemActionEquipped}>적용 중</Text>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>걷기 칭호에 도전해 보세요.</Text>
              </View>
            )
          ) : visibleWardrobeItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>이 카테고리에 보유한 아이템이 없어요.</Text>
            </View>
          ) : (
            visibleWardrobeItems.map((item) => {
              const equipped = equippedItems.includes(item.key);
              const busy = busyItemKey === item.key;
              return (
                <ControlPressable
                  key={item.key}
                  style={[styles.wardrobeItem, equipped && styles.wardrobeItemEquipped]}
                  disabled={busyItemKey !== null}
                  onPress={() => void toggleItem(item)}
                  accessibilityLabel={`${item.labelKo} ${equipped ? "해제" : "장착"}`}
                  accessibilityState={{ selected: equipped, busy }}
                >
                  <View style={styles.shopPreview} accessible={false}>
                    <SlimeSprite
                      slimeColor={wardrobeColor ?? selectedColor}
                      evolution="base"
                      action="idle"
                      equippedFloor="none"
                      displayScale={0.25}
                      itemSpritePath={shopItemSpritePath(item, wardrobeColor ?? selectedColor)}
                      accessibilityLabel={`${item.labelKo} 미리보기`}
                    />
                  </View>
                  <View style={styles.wardrobeItemCopy}>
                    <Text style={styles.floorTitle}>{item.labelKo}</Text>
                    <Text style={styles.floorSubtitle}>{item.floor ? "바닥" : item.category === "drink" ? "음료" : "소품"}</Text>
                  </View>
                  <Text style={[styles.wardrobeItemAction, equipped && styles.wardrobeItemActionEquipped]}>
                    {busy ? "처리 중…" : equipped ? "해제" : "장착"}
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
  petSectionNav: { width: "100%" },
  petSectionNavItem: { flex: 1 },
  myPetGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.xs },
  myPetCard: { position: "relative", width: "32%", minWidth: 0, alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xs },
  myPetCardEffectOpen: { zIndex: layers.raisedContent },
  myPetCardDisabled: { opacity: states.disabledOpacity },
  myPetSprite: { position: "relative", height: iconSizes.empty + spacing.md, width: "100%", alignItems: "center", justifyContent: "center", overflow: "visible" },
  myPetOverlayRow: { position: "absolute", left: 0, right: 0, top: 0, zIndex: layers.cardOverlay, height: iconSizes.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  myPetEffectButton: { width: iconSizes.lg, height: iconSizes.lg, alignItems: "center", justifyContent: "center", borderWidth: borders.none, borderRadius: radii.none, backgroundColor: colors.transparent },
  myPetEffectArrow: { width: slimeUi.effectArrow, height: slimeUi.effectArrow },
  myPetStarButton: { width: iconSizes.md, height: iconSizes.lg, alignItems: "center", justifyContent: "center", borderWidth: borders.none, borderRadius: radii.none, backgroundColor: colors.transparent },
  myPetEffectPopover: { position: "absolute", left: 0, top: iconSizes.lg + spacing.xxs, zIndex: layers.popover, width: slimeUi.effectPopoverWidth, padding: spacing.sm, gap: spacing.xxs, borderWidth: borders.hairline, borderColor: colors.border, borderRadius: radii.btn, backgroundColor: colors.surface, ...shadows.lift },
  myPetEffectPopoverTitle: { ...typography.micro, color: colors.text, fontWeight: "700" },
  myPetEffectPopoverText: { ...typography.micro, color: colors.textMuted },
  myPetName: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
  myPetNameSelected: { color: colors.accentTintedText },
  myPetGrowth: { position: "relative", zIndex: layers.notice, width: "100%", gap: spacing.xs, borderWidth: borders.none, borderRadius: radii.none, backgroundColor: colors.transparent },
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
  floorList: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.sm },
  shopPage: { gap: spacing.sm },
  shopBalance: { ...typography.label, color: colors.accentTintedText, textAlign: "right", fontVariant: ["tabular-nums"] },
  shopTabs: { gap: spacing.xxs, paddingBottom: spacing.xs },
  shopTab: { minHeight: tapMin - spacing.lg, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, alignItems: "center", justifyContent: "center", borderRadius: spacing.xs, backgroundColor: colors.surface },
  shopTabSelected: { backgroundColor: colors.accentTintedBg },
  shopTabText: { ...typography.label, color: colors.textMuted },
  shopTabTextSelected: { color: colors.accentTintedText },
  shopContent: { paddingBottom: spacing.sm, gap: spacing.sm },
  floorRow: { width: "31.5%", minWidth: 0, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm, borderWidth: borders.hairline, borderColor: colors.border, borderRadius: radii.control, backgroundColor: colors.surface, alignItems: "center", justifyContent: "flex-start", gap: spacing.xs },
  shopPreview: { width: iconSizes.empty, height: iconSizes.empty, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: colors.surfaceAlt },
  floorCopy: { width: "100%", minWidth: 0, alignItems: "center", gap: spacing.xxs },
  floorTitle: { ...typography.label, color: colors.text, textAlign: "center" },
  floorSubtitle: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
  floorStatus: { width: "100%", minHeight: tapMin, alignItems: "center", justifyContent: "center", gap: spacing.xxs },
  floorStatusText: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
  floorStatusBuy: { color: colors.accent },
  emptyCard: { width: "100%", padding: spacing.lg },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  notice: { position: "absolute", zIndex: layers.notice, bottom: tapMin + spacing.md, left: pageChrome.horizontalPadding, right: pageChrome.horizontalPadding, minHeight: tapMin, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.control, flexDirection: "row", alignItems: "center", gap: spacing.sm, ...shadows.lift },
  noticeSuccess: { backgroundColor: colors.plantActiveTintedBg },
  noticeError: { backgroundColor: colors.dangerTintedBg },
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
});
