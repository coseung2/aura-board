import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  Droplets,
  ShoppingBag,
  X,
} from "lucide-react-native";
import {
  AppBottomSheet,
  AppButton,
  AppHeader,
  ControlPressable,
  SectionHeader,
  SemanticNav,
  SemanticNavItem,
} from "../../components/ui";
import { SlimeSprite } from "../../components/slime/SlimeSprite";
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
  floorLabel,
  newSlimeIdempotencyKey,
  normalizeSlimeClassroom,
  normalizeSlimeHome,
  shopFilterForItem,
  slimeBallSpritePath,
  SLIME_COOKIE_ITEM_KEY,
  SLIME_COLOR_LABELS,
  SLIME_COLOR_SWATCHES,
  SLIME_STAGE_LABELS,
  SLIME_SHOP_NAV_ITEMS,
  stageForColor,
  type MobileSlimeHome,
  type MobileSlimeClassmate,
  type SlimeShopItem,
  type SlimeShopFilter,
} from "../../lib/slimes";
import { ApiError, apiFetch } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import {
  borders,
  colors,
  controls,
  iconSizes,
  layout,
  pageChrome,
  radii,
  spacing,
  states,
  tapMin,
  typography,
} from "../../theme/tokens";

type Notice = { kind: "success" | "error"; text: string };
type LocalImageSource = ImageProps["source"];

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
  const [busyColor, setBusyColor] = useState<SlimeColor | null>(null);
  const [busyRepresentative, setBusyRepresentative] = useState<SlimeColor | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopFilter, setShopFilter] = useState<SlimeShopFilter>("character");
  const [classmates, setClassmates] = useState<MobileSlimeClassmate[] | null>(null);
  const [classroomLoading, setClassroomLoading] = useState(false);
  const [classroomError, setClassroomError] = useState<string | null>(null);
  const retryKeysRef = useRef(new Map<string, string>());

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
          router.replace("/(student)/login");
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
  const section = params.section === "classroom" ? "classroom" : "mine";

  const loadClassroom = useCallback(async () => {
    setClassroomLoading(true);
    setClassroomError(null);
    try {
      const response = await apiFetch<unknown>("/api/student/slimes/classroom");
      setClassmates(normalizeSlimeClassroom(response));
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        await clearSessionToken();
        router.replace("/(student)/login");
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
          router.replace("/(student)/login");
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
      <AppHeader title="펫" onBack={() => router.back()} />
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
        <SemanticNav style={styles.petSectionNav} accessibilityLabel="펫 섹션">
          <SemanticNavItem
            style={styles.petSectionNavItem}
            selected={section === "mine" && !shopOpen}
            onPress={() => {
              setShopOpen(false);
              router.setParams({ section: "mine" });
            }}
          >
            내 펫
          </SemanticNavItem>
          <SemanticNavItem
            style={styles.petSectionNavItem}
            selected={section === "classroom" && !shopOpen}
            onPress={() => {
              setShopOpen(false);
              router.setParams({ section: "classroom" });
            }}
          >
            우리 반 펫
          </SemanticNavItem>
          <SemanticNavItem
            style={styles.petSectionNavItem}
            selected={shopOpen}
            onPress={() => {
              setShopFilter("character");
              setShopOpen(true);
            }}
          >
            상점
          </SemanticNavItem>
        </SemanticNav>

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
        <SectionHeader title="내 펫" right={<Text style={styles.sectionMeta}>{home?.ownedColors.length ?? 0} / 5 보유</Text>} />
        <View style={styles.myPetGrid} accessibilityRole="radiogroup" accessibilityLabel="내 슬라임 목록">
          {SLIME_ASSET_COLORS.map((itemColor) => {
            const isOwned = home?.ownedColors.includes(itemColor) ?? false;
            const selected = selectedColor === itemColor;
            const petStage = home ? stageForColor(home, itemColor) : 1;
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
                style={[styles.myPetCard, !isOwned && styles.myPetCardDisabled]}
              >
                <View style={styles.myPetSprite}>
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
                <View style={styles.myPetActions} accessibilityRole="group" accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 펫 관리`}>
                  <ControlPressable
                    style={styles.myPetActionButton}
                    disabled={!isOwned}
                    onPress={() => {
                      setSelectedColor(itemColor);
                      setShopFilter("prop");
                      setShopOpen(true);
                    }}
                  >
                    <Text style={styles.myPetActionText}>꾸미기</Text>
                  </ControlPressable>
                  <ControlPressable
                    style={styles.myPetCookieButton}
                    disabled={!isOwned || cookieQuantity <= 0 || busyItemKey !== null}
                    onPress={() => void feedCookie(itemColor)}
                    accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]}에게 쿠키 주기, ${cookieQuantity}개 보유`}
                  >
                    <Image
                      source={localSource(SLIME_SHARED_ASSETS.cookie.image)}
                      style={styles.myPetCookieIcon}
                      contentFit="contain"
                      allowDownscaling={false}
                      transition={0}
                      accessible={false}
                    />
                    <Text style={styles.myPetCookieQuantity}>{cookieQuantity}</Text>
                  </ControlPressable>
                  <ControlPressable
                    style={styles.myPetRepresentativeButton}
                    disabled={!isOwned || home?.representativeColor === itemColor || busyRepresentative !== null}
                    onPress={() => void setRepresentative(itemColor)}
                  >
                    <Text style={styles.myPetRepresentativeButtonText}>
                      {home?.representativeColor === itemColor
                        ? "대표 펫"
                        : busyRepresentative === itemColor
                          ? "지정 중…"
                          : "대표로 지정"}
                    </Text>
                  </ControlPressable>
                </View>
              </View>
            );
          })}
        </View>

        <AppBottomSheet
          visible={shopOpen}
          onClose={() => setShopOpen(false)}
          sheetStyle={styles.shopSheet}
          accessibilityLabel="슬라임 상점"
        >
          <View style={styles.shopSheetHeader}>
            <View style={styles.shopSheetHeading}>
              <Text style={styles.shopSheetEyebrow}>SLIME SHOP</Text>
              <Text style={styles.shopSheetTitle}>슬라임 상점</Text>
            </View>
            <ControlPressable
              style={styles.shopCloseButton}
              onPress={() => setShopOpen(false)}
              accessibilityLabel="상점 닫기"
            >
              <X size={iconSizes.md} color={colors.textMuted} accessible={false} />
            </ControlPressable>
          </View>
          <Text style={styles.shopBalance}>{home?.balance.toLocaleString() ?? 0}{home?.unitLabel ?? "원"}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shopTabs} accessibilityRole="tablist">
          {SLIME_SHOP_NAV_ITEMS.map((tab) => (
            <ControlPressable
              key={tab.key}
              style={[styles.shopTab, shopFilter === tab.key && styles.shopTabSelected]}
              onPress={() => setShopFilter(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: shopFilter === tab.key }}
            >
              <Text style={[styles.shopTabText, shopFilter === tab.key && styles.shopTabTextSelected]}>{tab.label}</Text>
            </ControlPressable>
          ))}
        </ScrollView>
        <ScrollView style={styles.shopSheetContent} contentContainerStyle={styles.shopSheetContentInner} showsVerticalScrollIndicator={false}>
        {shopFilter === "character" ? (
          <View style={styles.floorList}>
            {home?.catalog.map((slime) => {
              const isOwned = home.ownedColors.includes(slime.color);
              const busy = busyColor === slime.color;
              return (
                <ControlPressable key={slime.key} style={styles.floorRow} disabled={isOwned || busyColor !== null} onPress={() => void purchaseSlime(slime.color)} accessibilityLabel={`${slime.nameKo} ${isOwned ? "보유 중" : "구매"}`}>
                  <View style={[styles.colorSwatch, { backgroundColor: SLIME_COLOR_SWATCHES[slime.color] }]} />
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
              const equipped = equippedFloor === floor;
              const busy = busyItemKey === item.key;
              const canInteract = owned && busyItemKey === null;
              const status = busy
                ? "처리 중…"
                : equipped
                  ? "장착됨"
                  : ownedItem
                    ? "보유"
                    : `${item.price.toLocaleString()}${home?.unitLabel ?? "원"}`;
              return (
                <ControlPressable
                  key={item.key}
                  style={[styles.floorRow, equipped && styles.floorRowEquipped]}
                  disabled={!canInteract}
                  onPress={() => void mutateFloor(item)}
                  accessibilityLabel={`${floorLabel(floor)} ${equipped ? "장착됨, 다시 놀기" : ownedItem ? "장착" : "구매"}`}
                  accessibilityState={{ disabled: !canInteract, selected: equipped, busy }}
                >
                  <View style={[styles.floorIcon, equipped && styles.floorIconEquipped]} accessible={false}>
                    {floor === "grass-floor" ? <Text style={styles.floorEmoji}>🌱</Text> : null}
                    {floor === "water-puddle" ? <Droplets size={iconSizes.md} color={colors.accent} /> : null}
                    {floor === "trampoline" ? <Text style={styles.floorEmoji}>↕</Text> : null}
                  </View>
                  <View style={styles.floorCopy}>
                    <Text style={styles.floorTitle}>{item.labelKo || floorLabel(floor)}</Text>
                    <Text style={styles.floorSubtitle}>{floorLabel(floor)}</Text>
                  </View>
                  <View style={styles.floorStatus}>
                    {busy ? <ActivityIndicator size="small" color={colors.accent} /> : equipped ? <Check size={iconSizes.sm} color={colors.accent} accessible={false} /> : null}
                    <Text style={[styles.floorStatusText, equipped && styles.floorStatusEquipped, !ownedItem && !equipped && styles.floorStatusBuy]}>{status}</Text>
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
              const equipped = equippedItems.includes(item.key);
              const busy = busyItemKey === item.key;
              return (
                <ControlPressable
                  key={item.key}
                  style={[styles.floorRow, equipped && styles.floorRowEquipped]}
                  disabled={busyItemKey !== null}
                  onPress={() => void (ownedItem && !repeatable ? toggleItem(item) : purchaseItem(item))}
                  accessibilityLabel={`${item.labelKo} ${repeatable && quantity > 0 ? `${quantity}개 보유, 구매` : equipped ? "해제" : ownedItem ? "적용" : "구매"}`}
                >
                  <View style={styles.floorIcon}><ShoppingBag size={iconSizes.md} color={colors.accent} /></View>
                  <View style={styles.floorCopy}>
                    <Text style={styles.floorTitle}>{item.labelKo}</Text>
                    <Text style={styles.floorSubtitle}>{repeatable ? `${quantity}개 보유` : equipped ? "적용 중" : ownedItem ? "보유 중" : `${item.price.toLocaleString()}${home?.unitLabel ?? "원"}`}</Text>
                  </View>
                  <Text style={[styles.floorStatusText, !ownedItem && styles.floorStatusBuy]}>{busy ? "처리 중…" : repeatable ? `${item.price}${home?.unitLabel ?? "원"}` : equipped ? "해제" : ownedItem ? "적용" : "구매"}</Text>
                </ControlPressable>
              );
            })}
          </View>
        )}
        {notice ? (
          <View style={[styles.notice, notice.kind === "error" ? styles.noticeError : styles.noticeSuccess]} accessibilityRole="alert">
            {notice.kind === "error" ? <ArrowLeft size={iconSizes.sm} color={colors.danger} style={styles.noticeIcon} /> : <Check size={iconSizes.sm} color={colors.plantActive} style={styles.noticeIcon} />}
            <Text style={[styles.noticeText, notice.kind === "error" ? styles.noticeErrorText : styles.noticeSuccessText]}>{notice.text}</Text>
          </View>
        ) : null}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { ...typography.body, color: colors.textMuted },
  errorCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  errorEmoji: { fontSize: iconSizes.gate },
  errorTitle: { ...typography.title, color: colors.text, textAlign: "center" },
  errorMessage: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  scrollContent: { paddingHorizontal: pageChrome.horizontalPadding, paddingTop: pageChrome.contentStartGap, paddingBottom: spacing.xxxl, gap: spacing.lg },
  scrollContentWide: { alignSelf: "center", width: "100%", maxWidth: layout.readableMaxWidth },
  sectionMeta: { ...typography.micro, color: colors.textMuted },
  petSectionNav: { width: "100%" },
  petSectionNavItem: { flex: 1 },
  myPetGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.xs },
  myPetCard: { width: "32%", minWidth: 0, alignItems: "center", gap: spacing.xxs, paddingVertical: spacing.xs },
  myPetCardDisabled: { opacity: states.disabledOpacity },
  myPetSprite: { height: iconSizes.empty, width: "100%", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  myPetName: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
  myPetNameSelected: { color: colors.accentTintedText },
  myPetActions: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: spacing.xxs },
  myPetActionButton: { flex: 1, minWidth: 0, minHeight: tapMin, paddingHorizontal: spacing.xxs, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  myPetActionText: { ...typography.micro, color: colors.text, textAlign: "center" },
  myPetCookieButton: { width: tapMin, minHeight: tapMin, paddingHorizontal: spacing.xxs, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xxs, backgroundColor: colors.surfaceAlt },
  myPetCookieIcon: { width: iconSizes.md, height: iconSizes.md },
  myPetCookieQuantity: { ...typography.micro, color: colors.accentTintedText, fontVariant: ["tabular-nums"] },
  myPetRepresentativeButton: { width: "100%", minHeight: tapMin, paddingHorizontal: spacing.xxs, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentTintedBg },
  myPetRepresentativeButtonText: { ...typography.micro, color: colors.accentTintedText, textAlign: "center" },
  unownedSprite: { width: iconSizes.empty, height: iconSizes.empty, alignItems: "center", justifyContent: "center" },
  unownedGlyph: { ...typography.section, color: colors.textFaint },
  colorSwatch: { width: controls.radioSize, height: controls.radioSize, borderRadius: radii.pill, borderWidth: borders.hairline, borderColor: colors.border },
  floorList: { gap: spacing.sm },
  shopSheet: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  shopSheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  shopSheetHeading: { flex: 1, minWidth: 0, gap: spacing.xxs },
  shopSheetEyebrow: { ...typography.micro, color: colors.accent },
  shopSheetTitle: { ...typography.title, color: colors.text },
  shopCloseButton: { width: controls.iconButton, height: controls.iconButton, alignItems: "center", justifyContent: "center", borderWidth: borders.none, backgroundColor: colors.surfaceAlt },
  shopBalance: { ...typography.label, color: colors.accentTintedText, textAlign: "right", fontVariant: ["tabular-nums"] },
  shopTabs: { gap: spacing.sm, paddingBottom: spacing.xs },
  shopTab: { minHeight: tapMin, paddingHorizontal: spacing.md, alignItems: "center", justifyContent: "center", borderRadius: radii.pill, backgroundColor: colors.surface },
  shopTabSelected: { backgroundColor: colors.accentTintedBg },
  shopTabText: { ...typography.label, color: colors.textMuted },
  shopTabTextSelected: { color: colors.accentTintedText },
  shopSheetContent: { maxHeight: iconSizes.empty * 6 },
  shopSheetContentInner: { paddingBottom: spacing.sm, gap: spacing.sm },
  floorRow: { minHeight: controls.inputHeight + spacing.md + spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: borders.hairline, borderColor: colors.border, borderRadius: radii.control, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: spacing.md },
  floorRowEquipped: { borderColor: colors.accent, backgroundColor: colors.accentTintedBg },
  floorIcon: { width: controls.iconButton, height: controls.iconButton, borderRadius: radii.control, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceAlt },
  floorIconEquipped: { backgroundColor: colors.surface },
  floorEmoji: { fontSize: iconSizes.md },
  floorCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  floorTitle: { ...typography.label, color: colors.text },
  floorSubtitle: { ...typography.micro, color: colors.textMuted },
  floorStatus: { minWidth: 68, minHeight: tapMin, alignItems: "flex-end", justifyContent: "center", gap: spacing.xxs },
  floorStatusText: { ...typography.micro, color: colors.textMuted, textAlign: "right" },
  floorStatusEquipped: { color: colors.accentTintedText },
  floorStatusBuy: { color: colors.accent },
  emptyCard: { padding: spacing.lg },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  notice: { minHeight: tapMin, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.control, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  noticeSuccess: { backgroundColor: colors.plantActiveTintedBg },
  noticeError: { backgroundColor: colors.dangerTintedBg },
  noticeIcon: { transform: [{ rotate: "90deg" }] },
  noticeText: { ...typography.label, flex: 1 },
  noticeSuccessText: { color: colors.plantActive },
  noticeErrorText: { color: colors.danger },
  classroomCard: { padding: spacing.xxl, alignItems: "center", gap: spacing.md },
  classroomEmoji: { fontSize: iconSizes.gate },
  classroomTitle: { ...typography.title, color: colors.text },
  classroomText: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  classroomState: { padding: spacing.xxl, alignItems: "center", gap: spacing.md },
  classroomList: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing.xs },
  classmateCard: { width: "32%", minWidth: 0, padding: spacing.xs, alignItems: "center", gap: spacing.xxs, overflow: "hidden" },
  classmateName: { ...typography.micro, color: colors.text, alignSelf: "stretch", textAlign: "center" },
  classmateSprite: { height: iconSizes.empty, width: "100%", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  noRepresentative: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  classmatePlaceholderText: { ...typography.micro, color: colors.textMuted, textAlign: "center" },
});
