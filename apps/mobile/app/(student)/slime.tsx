import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image, type ImageProps } from "expo-image";
import {
  ArrowLeft,
  Check,
  Droplets,
  GlassWater,
  Sparkles,
} from "lucide-react-native";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  SectionHeader,
  SurfaceCard,
} from "../../components/ui";
import { SlimeSprite } from "../../components/slime/SlimeSprite";
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
  normalizeSlimeHome,
  SLIME_COLOR_LABELS,
  SLIME_COLOR_SWATCHES,
  SLIME_STAGE_LABELS,
  stageForColor,
  type MobileSlimeHome,
  type SlimeShopItem,
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
  const { width } = useWindowDimensions();
  const [home, setHome] = useState<MobileSlimeHome | null>(null);
  const [selectedColor, setSelectedColor] = useState<SlimeColor>("blue");
  const [action, setAction] = useState<SlimeAction>("idle");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null);
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

  const selectedStage = home ? stageForColor(home, selectedColor) : 1;
  const evolution = evolutionForStage(selectedStage);
  const equippedFloor =
    home?.equippedFloorByColor[selectedColor] ??
    (home?.representativeColor === selectedColor ? home.equippedFloor : "none");
  const selectedCatalogItem = home?.catalog.find(
    (item) => item.color === selectedColor,
  );
  const lemonade = home?.shopCatalog.find((item) => item.category === "drink");
  const equippedItems = home?.equippedItemsByColor[selectedColor] ?? [];
  const lemonadeEquipped = Boolean(
    lemonade && equippedItems.includes(lemonade.key),
  );
  const floorItems = useMemo(() => {
    if (!home) return [];
    return FLOOR_ORDER.map((floor) =>
      home.shopCatalog.find((item) => itemFloor(item) === floor),
    ).filter((item): item is SlimeShopItem => item !== undefined);
  }, [home]);

  const runAction = useCallback(
    (nextAction: SlimeAction, requires?: "lemonade" | "floor") => {
      if (requires === "lemonade" && !lemonadeEquipped) return;
      if (
        requires === "floor" &&
        equippedFloor !== "water-puddle" &&
        equippedFloor !== "trampoline"
      ) {
        return;
      }
      setNotice(null);
      setAction(nextAction);
    },
    [equippedFloor, lemonadeEquipped],
  );

  const retryKey = useCallback((scope: string, identity: string) => {
    const mapKey = `${scope}:${identity}`;
    const current = retryKeysRef.current.get(mapKey);
    if (current) return current;
    const created = newSlimeIdempotencyKey(scope, identity);
    retryKeysRef.current.set(mapKey, created);
    return created;
  }, []);

  const mutateFloor = useCallback(
    async (item: SlimeShopItem) => {
      const floor = itemFloor(item);
      if (!floor || !home || !home.ownedColors.includes(selectedColor)) return;
      const currentFloor =
        home.equippedFloorByColor[selectedColor] ?? "none";
      if (currentFloor === floor) {
        if (floor === "water-puddle" || floor === "trampoline") {
          runAction("floor-interaction", "floor");
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
        } else {
          await apiFetch("/api/student/slimes/items/equip", {
            method: "POST",
            json: { itemKey: item.key, slimeColor: selectedColor, isEquipped: true },
            headers: { "Idempotency-Key": retryKey(scope, keyIdentity) },
          });
          setNotice({ kind: "success", text: `${item.labelKo}를 장착했어요.` });
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
    [home, load, retryKey, router, runAction, selectedColor],
  );

  if (loading && !home) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <AppHeader title="슬라임" onBack={() => router.back()} />
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>슬라임 방을 준비하는 중…</Text>
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
          <Text style={styles.errorTitle}>슬라임 방을 열 수 없어요</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <AppButton onPress={() => void load()}>다시 시도</AppButton>
        </View>
      </SafeAreaView>
    );
  }

  const owned = home?.ownedColors.includes(selectedColor) ?? false;
  const stageGrowth = home?.growthByColor[selectedColor];
  const spriteWidth = width >= 520 ? 300 : 256;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="슬라임 방" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          width >= 720 && styles.scrollContentWide,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.accent}
          />
        }
      >
        <SurfaceCard style={styles.heroCard}>
          <View style={styles.heroHeading}>
            <View style={styles.heroHeadingCopy}>
              <Text style={styles.eyebrow}>OFFICIAL SLIME ROOM</Text>
              <Text style={styles.heroTitle}>
                {selectedCatalogItem?.nameKo ?? `${SLIME_COLOR_LABELS[selectedColor]} 슬라임`}
              </Text>
              <Text style={styles.heroSubtitle}>
                성장 {selectedStage}단계 · {SLIME_STAGE_LABELS[selectedStage]}
              </Text>
            </View>
            <View style={styles.stageBadge} accessibilityLabel={`${selectedStage}단계`}>
              <Sparkles size={iconSizes.sm} color={colors.accent} accessible={false} />
              <Text style={styles.stageBadgeText}>STAGE {selectedStage}</Text>
            </View>
          </View>

          <View style={[styles.spriteWrap, { minHeight: spriteWidth }]}>
            {owned ? (
              <SlimeSprite
                slimeColor={selectedColor}
                evolution={evolution}
                action={action}
                equippedFloor={equippedFloor}
                accessibilityLabel={`${SLIME_COLOR_LABELS[selectedColor]} 슬라임 ${SLIME_STAGE_LABELS[selectedStage]} 단계 ${action} 모습`}
                onComplete={() => setAction("idle")}
              />
            ) : (
              <View style={styles.unownedSprite} accessible accessibilityRole="image" accessibilityLabel="아직 보유하지 않은 슬라임">
                <Text style={styles.unownedGlyph}>?</Text>
              </View>
            )}
          </View>

          <View style={styles.evolutionRow}>
            <Text style={styles.evolutionLabel}>진화 모습</Text>
            <Text style={styles.evolutionValue}>{SLIME_STAGE_LABELS[selectedStage]}</Text>
          </View>
          {stageGrowth && stageGrowth.remainingSeconds > 0 ? (
            <Text style={styles.growthText}>
              다음 단계까지 약 {Math.max(1, stageGrowth.remainingMinutes)}분
            </Text>
          ) : null}
        </SurfaceCard>

        <SectionHeader title="색상 선택" right={<Text style={styles.sectionMeta}>{home?.ownedColors.length ?? 0} / 5 보유</Text>} />
        <View style={styles.colorGrid} accessibilityRole="radiogroup" accessibilityLabel="보유한 슬라임 색상">
          {SLIME_ASSET_COLORS.map((itemColor) => {
            const isOwned = home?.ownedColors.includes(itemColor) ?? false;
            const selected = selectedColor === itemColor;
            return (
              <ControlPressable
                key={itemColor}
                style={[styles.colorButton, selected && styles.colorButtonSelected, !isOwned && styles.colorButtonDisabled]}
                disabled={!isOwned}
                onPress={() => {
                  setSelectedColor(itemColor);
                  setAction("idle");
                  setNotice(null);
                }}
                accessibilityRole="radio"
                accessibilityLabel={`${SLIME_COLOR_LABELS[itemColor]} 슬라임${isOwned ? " 선택" : " (미보유)"}`}
                accessibilityState={{ selected, disabled: !isOwned }}
              >
                <View style={[styles.colorSwatch, { backgroundColor: SLIME_COLOR_SWATCHES[itemColor] }]} accessible={false} />
                <Text style={[styles.colorButtonText, selected && styles.colorButtonTextSelected]}>{SLIME_COLOR_LABELS[itemColor]}</Text>
                {selected ? <Check size={iconSizes.sm} color={colors.accent} accessible={false} /> : null}
              </ControlPressable>
            );
          })}
        </View>

        <SectionHeader title="행동" />
        <SurfaceCard style={styles.actionCard}>
          <ControlPressable
            style={styles.actionButton}
            onPress={() => runAction("happy")}
            disabled={!owned}
            accessibilityLabel="쿠키 먹고 행복해하기"
          >
            <Image
              source={localSource(SLIME_SHARED_ASSETS.cookie.image)}
              style={styles.cookieIcon}
              contentFit="contain"
              allowDownscaling={false}
              transition={0}
              accessible={false}
            />
            <Text style={styles.actionButtonText}>쿠키</Text>
            <Text style={styles.actionButtonHint}>행복</Text>
          </ControlPressable>
          <ControlPressable
            style={[styles.actionButton, !lemonadeEquipped && styles.actionButtonDisabled]}
            onPress={() => runAction("drink", "lemonade")}
            disabled={!owned || !lemonadeEquipped}
            accessibilityLabel={lemonadeEquipped ? "레모네이드 마시기" : "레모네이드 미보유"}
            accessibilityState={{ disabled: !owned || !lemonadeEquipped }}
          >
            <GlassWater size={iconSizes.lg} color={lemonadeEquipped ? colors.accent : colors.textFaint} accessible={false} />
            <Text style={[styles.actionButtonText, !lemonadeEquipped && styles.textMuted]}>레모네이드</Text>
            <Text style={styles.actionButtonHint}>{lemonadeEquipped ? "마시기" : "미보유"}</Text>
          </ControlPressable>
        </SurfaceCard>

        <SectionHeader
          title="바닥 인벤토리"
          right={<Text style={styles.sectionMeta}>{home?.balance.toLocaleString() ?? 0}{home?.unitLabel ?? "원"}</Text>}
        />
        <View style={styles.floorList} accessibilityLabel="바닥 인벤토리">
          {floorItems.length === 0 ? (
            <SurfaceCard style={styles.emptyCard}>
              <Text style={styles.emptyText}>바닥 상품을 준비 중이에요.</Text>
            </SurfaceCard>
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

        {notice ? (
          <View style={[styles.notice, notice.kind === "error" ? styles.noticeError : styles.noticeSuccess]} accessibilityRole="alert">
            {notice.kind === "error" ? <ArrowLeft size={iconSizes.sm} color={colors.danger} style={styles.noticeIcon} /> : <Check size={iconSizes.sm} color={colors.plantActive} style={styles.noticeIcon} />}
            <Text style={[styles.noticeText, notice.kind === "error" ? styles.noticeErrorText : styles.noticeSuccessText]}>{notice.text}</Text>
          </View>
        ) : null}
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
  heroCard: { padding: spacing.xl, gap: spacing.md },
  heroHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  heroHeadingCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  eyebrow: { ...typography.micro, color: colors.accent },
  heroTitle: { ...typography.display, color: colors.text, flexShrink: 1 },
  heroSubtitle: { ...typography.body, color: colors.textMuted },
  stageBadge: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: tapMin, paddingHorizontal: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.accentTintedBg },
  stageBadgeText: { ...typography.micro, color: colors.accentTintedText },
  spriteWrap: { alignItems: "center", justifyContent: "center", width: "100%", minHeight: iconSizes.empty * 4 },
  unownedSprite: { width: iconSizes.empty * 3, height: iconSizes.empty * 3, borderRadius: radii.card, borderWidth: borders.medium, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  unownedGlyph: { ...typography.display, color: colors.textFaint },
  evolutionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: borders.hairline, borderTopColor: colors.border },
  evolutionLabel: { ...typography.label, color: colors.textMuted },
  evolutionValue: { ...typography.label, color: colors.text, flexShrink: 1, textAlign: "right" },
  growthText: { ...typography.micro, color: colors.textMuted, textAlign: "right" },
  sectionMeta: { ...typography.micro, color: colors.textMuted },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  colorButton: { flexGrow: 1, flexBasis: "28%", minWidth: 92, minHeight: tapMin, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: borders.hairline, borderColor: colors.border, borderRadius: radii.control, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  colorButtonSelected: { borderColor: colors.accent, backgroundColor: colors.accentTintedBg },
  colorButtonDisabled: { opacity: states.disabledOpacity },
  colorSwatch: { width: controls.radioSize, height: controls.radioSize, borderRadius: radii.pill, borderWidth: borders.hairline, borderColor: colors.border },
  colorButtonText: { ...typography.label, color: colors.textMuted },
  colorButtonTextSelected: { color: colors.accentTintedText },
  actionCard: { flexDirection: "row", gap: spacing.sm, padding: spacing.sm },
  actionButton: { flex: 1, minHeight: controls.inputHeight + spacing.xl, alignItems: "center", justifyContent: "center", gap: spacing.xxs, borderRadius: radii.control, backgroundColor: colors.surfaceAlt },
  actionButtonDisabled: { opacity: states.disabledOpacity },
  cookieIcon: { width: iconSizes.lg, height: iconSizes.lg },
  actionButtonText: { ...typography.label, color: colors.text },
  actionButtonHint: { ...typography.micro, color: colors.textMuted },
  textMuted: { color: colors.textFaint },
  floorList: { gap: spacing.sm },
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
});
