import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, useWindowDimensions } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { resolvePetCardSceneGeometry } from "../../components/slime/slime-types";
import type { SlimeAction, SlimeColor } from "../slime-assets";
import {
  isSceneBackgroundItem,
  normalizeSlimeClassroom,
  normalizeSlimeHome,
  type MobileSlimeClassmate,
  type MobileSlimeHome,
  type SlimeShopItem,
  type SlimeShopFilter,
} from "../slimes";
import type {
  SlimeWardrobeFilter as WardrobeFilter,
} from "../slime-shop-presentation";
import { ApiError, apiFetch } from "../api";
import { clearSessionToken, getUnifiedLoginRoute } from "../session";
import { layout, pageChrome, slimeUi } from "../../theme/tokens";
import { useStudentSlimeDerivedState } from "./use-student-slime-derived-state";
import {
  DISABLED_COOKIE_SOURCE,
  SLIME_EFFECT_DESCRIPTIONS,
  SLIME_EFFECT_LABELS,
  SLIME_TRAMPOLINE_ITEM_KEY,
  apiErrorMessage,
  formatBuffPercent,
  localSource,
  type Notice,
} from "./student-slime-domain";
import { useStudentSlimeMutations } from "./use-student-slime-mutations";

export function useStudentSlimeScreenModel() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const petCardScene = useMemo(() => {
    const contentWidth = Math.min(windowWidth, layout.readableMaxWidth);
    const gridWidth = Math.max(
      0,
      contentWidth - pageChrome.horizontalPadding * 2,
    );
    // Own-pet and classmate grids are authored as three 32%-wide cells.
    const cardWidth = gridWidth * 0.32;
    return resolvePetCardSceneGeometry({
      cardWidth,
      baseDisplayScale: slimeUi.petSceneDisplayScale,
      baseSlotHeight: slimeUi.vehicleSceneSlotHeight,
      sceneScale: slimeUi.vehicleSceneScale,
    });
  }, [windowWidth]);

  const params = useLocalSearchParams<{ section?: string }>();
  const [home, setHome] = useState<MobileSlimeHome | null>(null);
  const [selectedColor, setSelectedColor] = useState<SlimeColor>("blue");
  const [manualActions, setManualActions] = useState<
    Partial<Record<SlimeColor, SlimeAction>>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState<SlimeShopItem | null>(
    null,
  );
  const [busyColor, setBusyColor] = useState<SlimeColor | null>(null);
  const [busyRepresentative, setBusyRepresentative] =
    useState<SlimeColor | null>(null);
  const [shopFilter, setShopFilter] = useState<SlimeShopFilter>("all");
  const [wardrobeColor, setWardrobeColor] = useState<SlimeColor | null>(null);
  const [wardrobeFilter, setWardrobeFilter] = useState<WardrobeFilter>("floor");
  const [openEffectColor, setOpenEffectColor] = useState<SlimeColor | null>(
    null,
  );
  const [openGrowthColor, setOpenGrowthColor] = useState<SlimeColor | null>(
    null,
  );
  const [classmates, setClassmates] = useState<MobileSlimeClassmate[] | null>(
    null,
  );
  const [classroomLoading, setClassroomLoading] = useState(false);
  const [classroomError, setClassroomError] = useState<string | null>(null);
  const homeRef = useRef<MobileSlimeHome | null>(null);
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
    const hasSceneBackground = (home?.shopCatalog ?? []).some((item) =>
      isSceneBackgroundItem(item),
    );
    if (!hasSceneBackground && shopFilter === "background") {
      setShopFilter("all");
    }
    if (!hasSceneBackground && wardrobeFilter === "background") {
      setWardrobeFilter("floor");
    }
  }, [home?.shopCatalog, shopFilter, wardrobeFilter]);

  const buffArrowAnimatedStyle = {
    opacity: buffRise.interpolate({
      inputRange: [0, 0.48, 1],
      outputRange: [0.78, 1, 0.78],
    }),
    transform: [
      {
        translateY: buffRise.interpolate({
          inputRange: [0, 0.48, 1],
          outputRange: [2, -3, 2],
        }),
      },
      {
        scale: buffRise.interpolate({
          inputRange: [0, 0.48, 1],
          outputRange: [0.94, 1.04, 0.94],
        }),
      },
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
  const {
    wardrobeTargetColor,
    wardrobeEquippedItems,
    shopNavItems,
    wardrobeNavItems,
    cookieQuantity,
    visibleShopItems,
    shopOverviewSections,
    activeSets,
    wardrobeItemWearer,
    visibleShopTiers,
    nestedShopGroups,
    visibleWardrobeItems,
    visibleWardrobeTitles,
    buffGroups,
    buffGroupsByColor,
    appliedBuffTotals,
    appliedGrowthSpeedBps,
    section,
  } = useStudentSlimeDerivedState({
    home,
    selectedColor,
    wardrobeColor,
    shopFilter,
    wardrobeFilter,
    sectionParam: params.section,
  });

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

  const {
    purchaseSlime,
    setRepresentative,
    purchaseItem,
    confirmSlimePurchase,
    confirmItemPurchase,
    confirmSlimeRefund,
    confirmItemRefund,
    toggleItem,
    toggleItemVisibility,
    toggleTitle,
    feedCookie,
  } = useStudentSlimeMutations({
    home,
    setHome,
    selectedColor,
    wardrobeColor,
    wardrobeTargetColor,
    cookieQuantity,
    busyItemKey,
    busyColor,
    busyRepresentative,
    load,
    router,
    setBusyItemKey,
    setBusyColor,
    setBusyRepresentative,
    setPendingPurchase,
    setNotice,
    setManualActions,
  });

  const showInitialLoading = loading && !home;
  const showInitialError = Boolean(error && !home);

  return {
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
    confirmSlimeRefund,
    confirmItemRefund,
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
  } as const;
}
