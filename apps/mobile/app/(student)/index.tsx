import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  BookOpen,
  CalendarCheck,
  ChevronRight,
  CircleCheck,
  Footprints,
  MessageCircle,
} from "lucide-react-native";
import {
  borders,
  colors,
  dashboard,
  iconSizes,
  layout,
  media,
  pageChrome,
  radii,
  shadows,
  slimeUi,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import {
  BOARD_LIST_CACHE_KEY,
  STUDENT_HOME_CACHE_KEY,
  readBoardCache,
  revalidateBoardCache,
  writeBoardCache,
} from "../../lib/board-cache";
import { roleEmoji, studentDutyTarget } from "../../lib/student-navigation";
import { isAssignmentReminderVisible } from "../../lib/student-notifications";
import type {
  MeResponse,
  StudentDailyRewardProgress,
  StudentAssignmentTodo,
  StudentDuty,
  WalletSummary,
} from "../../lib/types";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  Pill,
  SectionHeader,
} from "../../components/ui";
import {
  SectionNav,
  SectionNavItem,
} from "../../components/NavigationTabs";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";
import {
  resolvePetCardSceneGeometry,
} from "../../components/slime/slime-types";
import {
  SlimeSprite,
} from "../../components/slime/SlimeSprite";
import {
  normalizeSlimeHome,
  resolveEquippedSceneBackground,
  resolveEquippedSlimeWearables,
  resolveEquippedVehicle,
  selectSceneBackgroundSpritePath,
  stageForColor,
  type MobileSlimeHome,
} from "../../lib/slimes";
import { resolveEquippedSlimePropAction } from "../../lib/slime-props";
import { visibleEquippedSlimeItemKeys } from "../../lib/slime-item-visibility";
import type { EquippedFloor } from "../../lib/slime-assets";
import {
  fetchWalkingSnapshot,
  type WalkingDailyStepRewards,
  type WalkingMonthlyAttendanceReward,
  type WalkingWeeklyStepRewards,
} from "../../lib/walking-health";

const SLIME_TRAMPOLINE_ITEM_KEY = "slime-blue-trampoline";
const HOME_AUXILIARY_STALE_MS = 60_000;
const NAV_SHARED_CACHE_MS = 5 * 60_000;

// 학생 대시보드. 웹과 같은 /api/student/me 계약을 사용한다.

export default function StudentHome() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const initialHomeCache = readBoardCache<MeResponse>(STUDENT_HOME_CACHE_KEY, {
    kind: "boards",
  });
  const [me, setMe] = useState<MeResponse | null>(
    () => initialHomeCache?.data ?? null,
  );
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [petHome, setPetHome] = useState<MobileSlimeHome | null>(null);
  const [dailyWalking, setDailyWalking] = useState<WalkingDailyStepRewards | null>(null);
  const [weeklyWalking, setWeeklyWalking] = useState<WalkingWeeklyStepRewards | null>(null);
  const [walkingRankRewardCount, setWalkingRankRewardCount] = useState(0);
  const [attendance, setAttendance] = useState<WalkingMonthlyAttendanceReward | null>(null);
  const [readingClaimableCount, setReadingClaimableCount] = useState(0);
  const [readingRankRewardCount, setReadingRankRewardCount] = useState(0);
  const [dailyRewardLoading, setDailyRewardLoading] = useState(false);
  const [dailyRewardError, setDailyRewardError] = useState<string | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !initialHomeCache);
  const [refreshing, setRefreshing] = useState(false);
  const auxiliaryLoadedAtRef = useRef(0);
  const auxiliaryInFlightRef = useRef<Promise<void> | null>(null);

  const isLandscapeLayout = width > height && width >= dashboard.columns.one;

  const loadWallet = useCallback(async (force = false) => {
    setWalletLoading(true);
    try {
      const res = await apiFetch<WalletSummary>("/api/my/wallet", {
        cacheTtlMs: HOME_AUXILIARY_STALE_MS,
        forceRefresh: force,
      });
      setWallet(res);
    } catch {
      setWallet(null);
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const loadPet = useCallback(async (force = false) => {
    try {
      setPetHome(normalizeSlimeHome(await apiFetch<unknown>("/api/student/slimes", {
        cacheTtlMs: NAV_SHARED_CACHE_MS,
        forceRefresh: force,
      })));
    } catch {
      setPetHome(null);
    }
  }, []);

  const loadDailyRewards = useCallback(async (force = false) => {
    setDailyRewardLoading(true);
    const [walkingResult, readingResult] = await Promise.allSettled([
        fetchWalkingSnapshot(undefined, { forceRefresh: force }),
        apiFetch<{
          weeklyMissionReward?: { claimableStepCount?: number; claimable?: boolean } | null;
          classroomRankRewards?: unknown[];
        }>("/api/student/reading", {
          cacheTtlMs: NAV_SHARED_CACHE_MS,
          forceRefresh: force,
        }),
      ]);
    if (walkingResult.status === "fulfilled") {
      const snapshot = walkingResult.value;
      setDailyWalking(snapshot.dailyStepRewards);
      setWeeklyWalking(snapshot.weeklyStepRewards);
      setWalkingRankRewardCount(snapshot.classroomRankRewards.length);
      setAttendance(snapshot.monthlyAttendanceReward);
    }
    if (readingResult.status === "fulfilled") {
      const reading = readingResult.value;
      setReadingClaimableCount(
        Math.max(
          0,
          reading.weeklyMissionReward?.claimableStepCount ??
            (reading.weeklyMissionReward?.claimable ? 1 : 0),
        ),
      );
      setReadingRankRewardCount(reading.classroomRankRewards?.length ?? 0);
    }

    const failedLabels = [
      walkingResult.status === "rejected" ? "걷기" : null,
      readingResult.status === "rejected" ? "독서" : null,
    ].filter((label): label is string => Boolean(label));
    if (failedLabels.length === 0) {
      setDailyRewardError(null);
    } else if (failedLabels.length === 2) {
      setDailyRewardError("보상 현황을 불러오지 못했어요.");
    } else {
      setDailyRewardError(`${failedLabels[0]} 보상만 불러오지 못했어요.`);
    }
    setDailyRewardLoading(false);
  }, []);

  const loadAuxiliary = useCallback(
    (force = false): Promise<void> => {
      if (
        !force &&
        Date.now() - auxiliaryLoadedAtRef.current < HOME_AUXILIARY_STALE_MS
      ) {
        return Promise.resolve();
      }
      if (auxiliaryInFlightRef.current) return auxiliaryInFlightRef.current;

      const request = Promise.allSettled([
        loadPet(force),
        loadDailyRewards(force),
        loadWallet(force),
      ])
        .then(() => {
          auxiliaryLoadedAtRef.current = Date.now();
        })
        .finally(() => {
          if (auxiliaryInFlightRef.current === request) {
            auxiliaryInFlightRef.current = null;
          }
        });
      auxiliaryInFlightRef.current = request;
      return request;
    },
    [loadDailyRewards, loadPet, loadWallet],
  );

  const load = useCallback(
    async (isRefresh = false) => {
      const cached = readBoardCache<MeResponse>(STUDENT_HOME_CACHE_KEY, {
        kind: "boards",
      });
      if (cached) {
        setMe(cached.data);
        setLoading(false);
      } else {
        setLoading(true);
      }
      const auxiliaryTask = isRefresh
        ? loadAuxiliary(true)
        : new Promise<void>((resolve) => {
            InteractionManager.runAfterInteractions(() => {
              void loadAuxiliary().finally(resolve);
            });
          });
      try {
        if (isRefresh) setRefreshing(true);
        const res = await revalidateBoardCache<MeResponse>(
          STUDENT_HOME_CACHE_KEY,
          async () => {
            const response = await apiFetch<MeResponse>("/api/student/me");
            writeBoardCache(BOARD_LIST_CACHE_KEY, response.boards, {
              kind: "boards",
            });
            return response;
          },
          { force: isRefresh, kind: "boards" },
        );
        setMe(res);
        setError(null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await clearSessionToken();
          router.replace(getUnifiedLoginRoute("student"));
          return;
        }
        setError(e instanceof Error ? e.message : "불러올 수 없어요");
      } finally {
        if (isRefresh) await auxiliaryTask;
        setLoading(false);
        if (isRefresh) setRefreshing(false);
      }
    },
    [router, loadAuxiliary],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading && !me) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <AppHeader title="홈" />
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>보드를 불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !me) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <AppHeader title="홈" />
        <View style={styles.errorCenter}>
          <Text style={styles.errorEmoji}>😵</Text>
          <Text style={styles.errorTitle}>연결할 수 없어요</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <AppButton
            onPress={() => {
              setLoading(true);
              load();
            }}
          >
            다시 시도
          </AppButton>
        </View>
      </SafeAreaView>
    );
  }

  const duties = me?.duties ?? [];
  const assignments = me?.assignments ?? [];
  const studentName = me?.student.name ?? "학생";
  const overviewLandscape = isLandscapeLayout && assignments.length > 0;
  const walletCard = (
    <WalletCardCompact
      wallet={wallet}
      loading={walletLoading}
      onDetail={() => router.push("/(student)/wallet" as Href)}
      duties={duties}
      onOpen={(path) => router.push(path as Href)}
    />
  );
  const assignmentPanel = <AssignmentPanel assignments={assignments} />;
  const headerActions = <StudentHeaderActions />;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="홈"
        titleAccessory={
          <Text style={styles.headerStudentName} numberOfLines={1}>
            {studentName}
          </Text>
        }
        right={headerActions}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.accent}
          />
        }
      >
        <DailyGamePanel
          petHome={petHome}
          dailyRewards={me?.dailyRewards}
          dailyWalking={dailyWalking}
          weeklyWalking={weeklyWalking}
          walkingRankRewardCount={walkingRankRewardCount}
          attendance={attendance}
          readingClaimableCount={readingClaimableCount}
          readingRankRewardCount={readingRankRewardCount}
          loading={dailyRewardLoading}
          error={dailyRewardError}
          onOpenAttendance={() => router.push("/(student)/walking?view=missions" as Href)}
          onOpenWalkingMissions={() => router.push("/(student)/walking?view=missions" as Href)}
          onOpenWalkingRank={() => router.push("/(student)/walking?view=record" as Href)}
          onOpenReadingMissions={() => router.push("/(student)/reading?view=missions" as Href)}
          onOpenReadingRank={() => router.push("/(student)/reading?view=records" as Href)}
          onOpenBoards={() => router.push("/(student)/boards" as Href)}
        />
        <View
          style={
            overviewLandscape ? styles.landscapeOverview : styles.overviewStack
          }
        >
          <View
            style={[
              styles.overviewItem,
              overviewLandscape && styles.landscapeOverviewItem,
            ]}
          >
            {walletCard}
          </View>
          {assignments.length > 0 ? (
            <View
              style={[
                styles.overviewItem,
                overviewLandscape && styles.landscapeOverviewItem,
              ]}
            >
              {assignmentPanel}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DailyGamePanel({
  petHome,
  dailyRewards,
  dailyWalking,
  weeklyWalking,
  walkingRankRewardCount,
  attendance,
  readingClaimableCount,
  readingRankRewardCount,
  loading,
  error,
  onOpenAttendance,
  onOpenWalkingMissions,
  onOpenWalkingRank,
  onOpenReadingMissions,
  onOpenReadingRank,
  onOpenBoards,
}: {
  petHome: MobileSlimeHome | null;
  dailyRewards: MeResponse["dailyRewards"];
  dailyWalking: WalkingDailyStepRewards | null;
  weeklyWalking: WalkingWeeklyStepRewards | null;
  walkingRankRewardCount: number;
  attendance: WalkingMonthlyAttendanceReward | null;
  readingClaimableCount: number;
  readingRankRewardCount: number;
  loading: boolean;
  error: string | null;
  onOpenAttendance: () => void;
  onOpenWalkingMissions: () => void;
  onOpenWalkingRank: () => void;
  onOpenReadingMissions: () => void;
  onOpenReadingRank: () => void;
  onOpenBoards: () => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const homePetScene = useMemo(() => {
    const contentWidth = Math.min(windowWidth, layout.readableMaxWidth);
    const bodyWidth = Math.max(0, contentWidth - pageChrome.horizontalPadding * 2);
    // Home pet pane is authored as 46% of the daily-game row.
    const paneWidth = bodyWidth * 0.46;
    // Phone keeps the authored 120px scene (0.3125 scale) inside the 46% pane.
    // Fill factor is the phone scene width over the phone pane width so compact
    // layouts stay put while wider tablets grow the whole scene uniformly.
    const phoneBodyWidth = Math.max(0, 360 - pageChrome.horizontalPadding * 2);
    const phonePaneWidth = phoneBodyWidth * 0.46;
    const phoneSceneWidth =
      64 * 4 * slimeUi.vehicleSceneScale * slimeUi.homePetSceneDisplayScale;
    const widthFill =
      phonePaneWidth > 0 ? Math.min(1, phoneSceneWidth / phonePaneWidth) : 1;
    return resolvePetCardSceneGeometry({
      cardWidth: paneWidth,
      baseDisplayScale: slimeUi.homePetSceneDisplayScale,
      baseSlotHeight: slimeUi.homePetSceneHeight,
      sceneScale: slimeUi.vehicleSceneScale,
      widthFill,
    });
  }, [windowWidth]);
  const color = petHome?.representativeColor;
  const stage = color && petHome ? stageForColor(petHome, color) : null;
  const equippedItems = color && petHome ? petHome.equippedItemsByColor[color] ?? [] : [];
  const visibleItems = color
    ? visibleEquippedSlimeItemKeys(equippedItems, petHome?.hiddenItemsByColor[color])
    : [];
  const equippedFloor = visibleItems.reduce<EquippedFloor>(
    (current, itemKey) => petHome?.shopCatalog.find((item) => item.key === itemKey)?.floor ?? current,
    "none",
  );
  const equippedBackground = resolveEquippedSceneBackground(
    visibleItems,
    petHome?.shopCatalog ?? [],
  );
  const equippedBackgroundPath = equippedBackground
    ? selectSceneBackgroundSpritePath(equippedBackground)
    : null;
  const equippedWearables = resolveEquippedSlimeWearables(
    visibleItems,
    petHome?.shopCatalog ?? [],
  );
  const equippedVehicle = resolveEquippedVehicle(
    visibleItems,
    petHome?.shopCatalog ?? [],
  );
  const usesTrampoline = equippedVehicle?.key === SLIME_TRAMPOLINE_ITEM_KEY;
  const renderedVehicle = usesTrampoline ? null : equippedVehicle;
  const propAction = resolveEquippedSlimePropAction(visibleItems, petHome?.shopCatalog ?? []);
  const action = usesTrampoline
    ? "floor-interaction" as const
    : "idle" as const;

  return (
    <View style={styles.dailyGamePanel}>
      <View style={styles.dailyGameHeader}>
        <View style={styles.petHeaderTitle}>
          <Text style={styles.dailyGameTitle}>대표 펫</Text>
        </View>
        <View style={styles.rewardHeaderTitle}>
          <Text style={styles.dailyGameTitle}>오늘 보상</Text>
        </View>
      </View>
      <View style={styles.dailyGameBody}>
        <View style={styles.petPane}>
          {color && stage !== null ? (
            <View
              style={[
                styles.representativePetScene,
                { height: homePetScene.slotHeight },
              ]}
            >
          <SlimeSprite
            slimeColor={color}
            growthStage={stage}
            action={action}
            equippedFloor={usesTrampoline ? "trampoline" : equippedFloor}
            repeat={Boolean(propAction) || action !== "idle"}
            propAction={propAction}
            wearables={equippedWearables}
            drinkFlavor={equippedWearables.drink}
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
            displayScale={homePetScene.displayScale}
            expandSceneSurfaces
            backgroundSpritePath={equippedBackgroundPath ?? undefined}
            accessibilityLabel="내 대표 펫"
          />
            </View>
          ) : (
            <View style={styles.petEmptyState} accessibilityRole="text">
              <Text style={styles.petEmptyText}>대표펫이 없어요</Text>
            </View>
          )}
        </View>
        <DailyRewardChecklist
          dailyRewards={dailyRewards}
          dailyWalking={dailyWalking}
          weeklyWalking={weeklyWalking}
          walkingRankRewardCount={walkingRankRewardCount}
          attendance={attendance}
          readingClaimableCount={readingClaimableCount}
          readingRankRewardCount={readingRankRewardCount}
          loading={loading}
          error={error}
          onOpenAttendance={onOpenAttendance}
          onOpenWalkingMissions={onOpenWalkingMissions}
          onOpenWalkingRank={onOpenWalkingRank}
          onOpenReadingMissions={onOpenReadingMissions}
          onOpenReadingRank={onOpenReadingRank}
          onOpenBoards={onOpenBoards}
        />
      </View>
    </View>
  );
}

function DailyRewardChecklist({
  dailyRewards,
  dailyWalking,
  weeklyWalking,
  walkingRankRewardCount,
  attendance,
  readingClaimableCount,
  readingRankRewardCount,
  loading,
  error,
  onOpenAttendance,
  onOpenWalkingMissions,
  onOpenWalkingRank,
  onOpenReadingMissions,
  onOpenReadingRank,
  onOpenBoards,
}: {
  dailyRewards: MeResponse["dailyRewards"];
  dailyWalking: WalkingDailyStepRewards | null;
  weeklyWalking: WalkingWeeklyStepRewards | null;
  walkingRankRewardCount: number;
  attendance: WalkingMonthlyAttendanceReward | null;
  readingClaimableCount: number;
  readingRankRewardCount: number;
  loading: boolean;
  error: string | null;
  onOpenAttendance: () => void;
  onOpenWalkingMissions: () => void;
  onOpenWalkingRank: () => void;
  onOpenReadingMissions: () => void;
  onOpenReadingRank: () => void;
  onOpenBoards: () => void;
}) {
  const today = dailyWalking?.day;
  const attendanceClaimable = attendance?.claimableAttendance?.filter(
    (entry) => !today || entry.day <= today,
  ) ?? [];
  const attendanceComplete = Boolean(
    today && attendance?.attendanceDays?.includes(today),
  );
  const walkingClaimable = dailyWalking?.tiers.filter((tier) => tier.claimable) ?? [];
  const weeklyWalkingClaimableCount = weeklyWalking?.tiers.filter(
    (tier) => tier.achieved && !tier.claimed,
  ).length ?? 0;
  const walkingMissionClaimableCount =
    walkingClaimable.length + weeklyWalkingClaimableCount;
  const walkingStatus = rewardSourcesLabel([
    ["일간", walkingClaimable.length],
    ["주간", weeklyWalkingClaimableCount],
    ["Top 5", walkingRankRewardCount],
  ]);
  const readingStatus = rewardSourcesLabel([
    ["주간", readingClaimableCount],
    ["Top 5", readingRankRewardCount],
  ]);

  if (loading && !dailyWalking) {
    return (
      <View style={styles.dailyRewardList} accessibilityLabel="오늘 보상 불러오는 중">
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.dailyRewardLoading}>현황 확인 중…</Text>
      </View>
    );
  }

  return (
    <View style={styles.dailyRewardList} accessibilityLabel="오늘 받을 수 있는 보상">
      <DailyRewardRow
        icon={CalendarCheck}
        label="출석"
        status={attendanceClaimable.length > 0 ? `${attendanceClaimable.length}개 받기` : attendanceComplete ? "오늘 완료" : "접속 확인 중"}
        complete={attendanceComplete && attendanceClaimable.length === 0}
        claimable={attendanceClaimable.length > 0}
        onPress={onOpenAttendance}
      />
      {walkingMissionClaimableCount + walkingRankRewardCount > 0 ? (
        <DailyRewardRow
          icon={Footprints}
          label="걷기"
          status={walkingStatus}
          claimable
          onPress={
            walkingMissionClaimableCount > 0
              ? onOpenWalkingMissions
              : onOpenWalkingRank
          }
        />
      ) : null}
      <DailyRewardRow
        icon={MessageCircle}
        label="댓글"
        status={progressLabel(dailyRewards?.comment)}
        complete={dailyRewards?.comment.complete === true}
        disabled={dailyRewards?.comment.enabled === false}
        onPress={onOpenBoards}
      />
      {readingClaimableCount + readingRankRewardCount > 0 ? (
        <DailyRewardRow
          icon={BookOpen}
          label="독서"
          status={readingStatus}
          claimable
          onPress={
            readingClaimableCount > 0
              ? onOpenReadingMissions
              : onOpenReadingRank
          }
        />
      ) : null}
      {error ? <Text style={styles.dailyRewardError} numberOfLines={1}>{error}</Text> : null}
    </View>
  );
}

function rewardSourcesLabel(sources: Array<[string, number]>): string {
  return sources
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`)
    .join(" · ");
}

function progressLabel(progress: StudentDailyRewardProgress | undefined) {
  if (!progress) return "확인 중";
  if (!progress.enabled) return "보상 없음";
  if (progress.complete) return "오늘 완료";
  return `${progress.earnedCount}/${progress.dailyCap} 받음`;
}

type DailyRewardIcon = typeof CalendarCheck;

function DailyRewardRow({
  icon: Icon,
  label,
  status,
  complete = false,
  claimable = false,
  busy = false,
  disabled = false,
  onPress,
}: {
  icon: DailyRewardIcon;
  label: string;
  status: string;
  complete?: boolean;
  claimable?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <ControlPressable
      style={styles.dailyRewardRow}
      onPress={onPress}
      disabled={busy}
      accessibilityLabel={`${label} 보상, ${busy ? "처리 중" : status}`}
      accessibilityState={{ busy, disabled: disabled || busy }}
    >
      <Icon size={iconSizes.sm} color={complete ? colors.plantActive : claimable ? colors.accent : colors.textMuted} strokeWidth={2} accessible={false} />
      <Text style={styles.dailyRewardLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.dailyRewardStatus, complete && styles.dailyRewardStatusComplete, claimable && styles.dailyRewardStatusClaimable, disabled && styles.dailyRewardStatusDisabled]} numberOfLines={1}>
        {busy ? "받는 중…" : status}
      </Text>
      {complete ? <CircleCheck size={iconSizes.sm} color={colors.plantActive} strokeWidth={2.4} accessible={false} /> : <ChevronRight size={iconSizes.sm} color={colors.textFaint} strokeWidth={2} accessible={false} />}
    </ControlPressable>
  );
}

const ASSIGNMENT_VISIBLE_LIMIT = 4;

function assignmentTarget(item: StudentAssignmentTodo): string | null {
  if (!item.href) return null;
  if (item.href.includes("/check") || item.href.startsWith("/classroom/")) {
    return `/(student)/check?classroomId=${encodeURIComponent(item.boardSlug)}`;
  }
  return `/(student)/board/${encodeURIComponent(item.boardSlug)}`;
}

function formatAssignmentDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function AssignmentPanel({
  assignments,
}: {
  assignments: StudentAssignmentTodo[];
}) {
  const router = useRouter();
  const missingCount = assignments.filter((item) => !item.submitted).length;
  const completedCount = assignments.length - missingCount;
  const [filter, setFilter] = useState<"missing" | "completed">(
    missingCount > 0 ? "missing" : "completed",
  );
  const [showAll, setShowAll] = useState(false);

  if (assignments.length === 0) return null;

  const ordered = [...assignments].sort((a, b) => {
    if (a.submitted !== b.submitted) return a.submitted ? 1 : -1;
    return b.assignedAt.localeCompare(a.assignedAt);
  });
  const filtered = ordered.filter((item) =>
    filter === "missing" ? !item.submitted : item.submitted,
  );
  const visibleItems = showAll
    ? filtered
    : filtered.slice(0, ASSIGNMENT_VISIBLE_LIMIT);
  const hiddenCount = Math.max(filtered.length - visibleItems.length, 0);

  const emptyMessage =
    filter === "missing" ? "미제출 과제가 없어요" : "완료한 과제가 없어요";

  return (
    <View style={styles.assignmentPanel}>
      <SectionHeader
        title="과제 목록"
        right={
          <SectionNav
            style={styles.sectionNav}
            accessibilityLabel="과제 필터"
          >
            <FilterChip
              active={filter === "missing"}
              onPress={() => setFilter("missing")}
              tone="danger"
            >
              미제출 {missingCount}
            </FilterChip>
            <FilterChip
              active={filter === "completed"}
              onPress={() => setFilter("completed")}
              tone="neutral"
            >
              완료 {completedCount}
            </FilterChip>
          </SectionNav>
        }
      />

      <View style={styles.assignmentList}>
        <View style={styles.assignmentRows}>
          {filtered.length === 0 ? (
            <Text style={styles.assignmentEmpty}>{emptyMessage}</Text>
          ) : (
            visibleItems.map((item) => {
              const target = assignmentTarget(item);
              return (
                <AssignmentRow
                  key={item.id}
                  item={item}
                  onPress={
                    target ? () => router.push(target as Href) : undefined
                  }
                />
              );
            })
          )}
        </View>
        {filtered.length > ASSIGNMENT_VISIBLE_LIMIT ? (
          <ControlPressable
            style={styles.assignmentExpand}
            onPress={() => setShowAll((current) => !current)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showAll }}
          >
            <Text style={styles.assignmentExpandText}>
              {showAll
                ? "접기 ↑"
                : `${filter === "missing" ? "미제출" : "완료"} 과제 ${hiddenCount}개 더 보기 ↓`}
            </Text>
          </ControlPressable>
        ) : null}
      </View>
    </View>
  );
}

function FilterChip({
  active,
  tone,
  onPress,
  children,
}: {
  active: boolean;
  tone: "danger" | "neutral";
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <SectionNavItem selected={active} tone={tone} onPress={onPress}>
      {children}
    </SectionNavItem>
  );
}

function AssignmentRow({
  item,
  onPress,
}: {
  item: StudentAssignmentTodo;
  onPress?: () => void;
}) {
  const submitted = item.submitted;
  const reminded = isAssignmentReminderVisible(item);

  const dateText = submitted
    ? item.submittedAt
      ? `제출 ${formatAssignmentDate(item.submittedAt)}`
      : "제출 완료"
    : reminded
      ? `알림 ${formatAssignmentDate(item.reminderSentAt)}`
      : item.dueAt
        ? `마감 ${formatAssignmentDate(item.dueAt)}`
        : item.assignedAt
        ? `배부 ${formatAssignmentDate(item.assignedAt)}`
        : "과제 배부됨";

  const content = (
    <View style={styles.assignmentRowInner}>
      <View style={styles.assignmentMain}>
        <Text style={styles.assignmentTitleText} numberOfLines={1}>
          {item.sectionTitle}
        </Text>
        <Text style={styles.assignmentSubtitleText} numberOfLines={1}>
          {item.boardTitle}
        </Text>
      </View>
      <View style={styles.assignmentMeta}>
        <Text
          style={[
            styles.assignmentStatus,
            submitted
              ? styles.assignmentStatusSubmitted
              : styles.assignmentStatusMissing,
          ]}
          numberOfLines={1}
        >
          {submitted ? "제출 완료" : "미제출"}
        </Text>
        <Text style={styles.assignmentDate} numberOfLines={1}>
          {dateText}
        </Text>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <ControlPressable style={styles.assignmentRow} onPress={onPress}>
        {content}
      </ControlPressable>
    );
  }

  return (
    <View style={[styles.assignmentRow, styles.assignmentRowStatic]}>
      {content}
    </View>
  );
}

function WalletCardCompact({
  wallet,
  loading,
  onDetail,
  duties,
  onOpen,
}: {
  wallet: WalletSummary | null;
  loading: boolean;
  onDetail: () => void;
  duties: StudentDuty[];
  onOpen: (path: Href) => void;
}) {
  const [panel, setPanel] = useState<"wallet" | "duties">("wallet");
  const hasDuties = duties.some((duty) => studentDutyTarget(duty) !== null);
  const showDuties = hasDuties && panel === "duties";

  return (
    <View style={styles.walletCardCompact}>
      <SectionHeader
        title={showDuties ? "내 역할" : "은행"}
        titleAccessory={
          !showDuties ? (
            <ControlPressable
              style={styles.walletDetailLink}
              onPress={onDetail}
              hitSlop={8}
              accessibilityLabel="통장 자세히 보기"
            >
              <Text style={styles.walletDetailLinkText} numberOfLines={1}>
                자세히
              </Text>
              <ChevronRight
                size={iconSizes.sm}
                color={colors.textMuted}
                strokeWidth={2}
                accessible={false}
              />
            </ControlPressable>
          ) : undefined
        }
        right={
          hasDuties ? (
            <SectionNav
              style={styles.sectionNav}
              accessibilityLabel="은행 보기"
            >
              <SectionNavItem
                selected={!showDuties}
                onPress={() => setPanel("wallet")}
              >
                통장
              </SectionNavItem>
              <SectionNavItem
                selected={showDuties}
                onPress={() => setPanel("duties")}
              >
                내 역할
              </SectionNavItem>
            </SectionNav>
          ) : undefined
        }
      />

      {showDuties ? (
        <DutySectionCompact duties={duties} onOpen={onOpen} />
      ) : loading || !wallet ? (
        <Text style={styles.walletEmptyCompact}>
          통장 정보를 불러오는 중이에요.
        </Text>
      ) : (
        <>
          <View style={styles.walletBalanceRowCompact}>
            <Text style={styles.walletBalanceLabelCompact}>현재 잔고</Text>
            <Text style={styles.walletBalanceValueCompact}>
              {wallet.balance.toLocaleString()} {wallet.currency.unitLabel}
            </Text>
          </View>
          {wallet.activeFDs.length > 0 && (
            <Pill tone="accent" textStyle={styles.walletFdPillText}>
              적금 {wallet.activeFDs.length}개
            </Pill>
          )}
        </>
      )}
    </View>
  );
}

function DutySectionCompact({
  duties,
  onOpen,
}: {
  duties: StudentDuty[];
  onOpen: (path: Href) => void;
}) {
  const visible = duties
    .map((duty) => ({ duty, target: studentDutyTarget(duty) }))
    .filter(
      (
        item,
      ): item is {
        duty: StudentDuty;
        target: NonNullable<ReturnType<typeof studentDutyTarget>>;
      } => item.target !== null,
    );
  if (visible.length === 0) return null;

  return (
    <View style={styles.dutyList}>
      {visible.map(({ duty, target }, index) => (
        <ControlPressable
          key={`${duty.classroomId}-${duty.roleKey}`}
          style={[
            styles.dutyRow,
            index === visible.length - 1 && styles.dutyRowLast,
          ]}
          onPress={() => onOpen(target.href as Href)}
          accessibilityLabel={`${duty.classroomName} ${duty.roleLabel} 시작`}
        >
          <Text style={styles.dutyRowEmoji} accessible={false}>
            {duty.emoji ?? roleEmoji(duty.roleKey)}
          </Text>
          <View style={styles.dutyRowCopy}>
            <Text
              style={styles.dutyRowRole}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {duty.roleLabel}
            </Text>
            <Text
              style={styles.dutyRowClassroom}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {duty.classroomName}
            </Text>
          </View>
          <Text style={styles.dutyRowCta} accessible={false}>
            시작
          </Text>
        </ControlPressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: { ...typography.body, color: colors.textMuted },

  errorCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  errorEmoji: { fontSize: iconSizes.gate },
  errorTitle: { ...typography.title, color: colors.text },
  errorMsg: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  scrollContent: {
    paddingHorizontal: pageChrome.horizontalPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  dailyGamePanel: {
    alignSelf: "stretch",
    backgroundColor: colors.transparent,
  },
  dailyGameHeader: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  petHeaderTitle: {
    width: "46%",
    minHeight: tapMin,
    minWidth: 0,
    alignItems: "center",
    flexDirection: "row",
  },
  rewardHeaderTitle: {
    flex: 1,
    minWidth: 0,
    paddingLeft: spacing.sm,
  },
  dailyGameTitle: {
    ...typography.section,
    color: colors.text,
  },
  dailyGameBody: {
    minHeight: slimeUi.homePetSceneHeight,
    flexDirection: "row",
    alignItems: "stretch",
  },
  petPane: {
    width: "46%",
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  representativePetScene: {
    position: "relative",
    width: "100%",
    height: slimeUi.homePetSceneHeight,
    maxWidth: "100%",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  petEmptyState: {
    height: slimeUi.homePetSceneHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  petEmptyText: { ...typography.body, color: colors.textMuted },
  dailyRewardList: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingVertical: spacing.xxs,
  },
  dailyRewardLoading: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  dailyRewardRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  dailyRewardLabel: {
    ...typography.badge,
    color: colors.text,
    width: spacing.xxl,
  },
  dailyRewardStatus: {
    ...typography.micro,
    color: colors.textMuted,
    flex: 1,
    minWidth: 0,
    textAlign: "right",
  },
  dailyRewardStatusComplete: { color: colors.plantActive },
  dailyRewardStatusClaimable: { color: colors.accentTintedText },
  dailyRewardStatusDisabled: { color: colors.textFaint },
  dailyRewardError: {
    ...typography.micro,
    color: colors.danger,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xxs,
  },
  landscapeOverview: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.lg,
  },
  overviewStack: {
    gap: spacing.none,
  },
  overviewItem: {
    minWidth: 0,
  },
  landscapeOverviewItem: {
    flex: 1,
    minWidth: 0,
  },

  headerStudentName: {
    ...typography.label,
    color: colors.textMuted,
    flexShrink: 1,
    alignSelf: "flex-end",
  },
  showcaseBand: {
    marginHorizontal: -spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.showcaseBand,
    gap: spacing.sm,
  },
  showcaseHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  showcaseTitle: {
    ...typography.section,
    color: colors.text,
  },
  showcaseTitleIcon: { fontSize: iconSizes.md },
  showcaseMore: {
    ...typography.label,
    color: colors.accent,
  },
  showcaseRowContent: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  showcaseChip: {
    width: dashboard.compactCardSize,
    minHeight: dashboard.compactCardSize,
    overflow: "hidden",
    position: "relative",
  },
  showcaseChipSkeleton: {
    width: dashboard.compactCardSize,
    height: dashboard.compactCardSize,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
  },
  showcaseChipBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: dashboard.badgeSize,
    height: dashboard.badgeSize,
    borderRadius: radii.pill,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  showcaseChipBadgeText: { ...typography.badge },
  showcasePreview: {
    aspectRatio: media.previewAspectRatio,
    backgroundColor: colors.bgAlt,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  showcasePreviewImage: {
    width: "100%",
    height: "100%",
  },
  showcasePlay: {
    position: "absolute",
    width: spacing.xxl,
    height: spacing.xxl,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  showcasePlayText: {
    color: colors.text,
    fontSize: iconSizes.md,
    marginLeft: spacing.xs,
  },
  showcaseChipBody: { gap: spacing.xs, padding: spacing.sm },
  showcaseChipTitle: { ...typography.section, color: colors.text },
  showcaseChipContent: {
    ...typography.body,
    color: colors.textMuted,
  },
  showcaseMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  showcaseAuthor: {
    maxWidth: dashboard.authorMaxWidth,
  },
  showcaseAuthorText: {
    ...typography.badge,
    color: colors.accent,
  },
  showcaseDate: { ...typography.micro, color: colors.textMuted },

  portfolioCtaCompact: {
    paddingVertical: spacing.md,
  },
  walletCardCompact: {
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  sectionNav: {
    paddingTop: spacing.xs,
  },
  walletTitleCompact: { ...typography.subtitle, color: colors.text },
  walletDetailLink: {
    minHeight: tapMin,
    minWidth: 0,
    flexDirection: "row",
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.none,
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
    alignItems: "flex-end",
    justifyContent: "center",
    flexShrink: 1,
  },
  walletDetailLinkText: {
    ...typography.badge,
    color: colors.textMuted,
  },
  walletBalanceRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  walletBalanceLabelCompact: {
    ...typography.body,
    color: colors.textMuted,
  },
  walletBalanceValueCompact: {
    ...typography.subtitle,
    color: colors.text,
    paddingBottom: spacing.xxs,
  },
  walletFdPillText: {
    ...typography.badge,
    color: colors.accent,
  },
  walletEmptyCompact: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.xs,
  },

  dutyList: {
    overflow: "hidden",
  },
  dutyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: tapMin,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.none,
    borderWidth: borders.none,
    borderRadius: radii.none,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.transparent,
  },
  dutyRowLast: {
    borderBottomWidth: borders.none,
  },
  dutyRowEmoji: { fontSize: iconSizes.md },
  dutyRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  dutyRowRole: {
    ...typography.label,
    color: colors.text,
  },
  dutyRowClassroom: {
    ...typography.micro,
    color: colors.textMuted,
  },
  dutyRowCta: {
    ...typography.badge,
    color: colors.accent,
  },

  sectionSub: {
    ...typography.section,
    color: colors.text,
  },
  boardSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    flexWrap: "wrap",
    paddingTop: spacing.md,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  boardGrid: { marginTop: spacing.xxs },
  gridRow: { flexDirection: "row" },
  gridCell: { flex: 1 },
  boardCard: {
    flex: 1,
    minHeight: dashboard.boardMinHeight,
    padding: 0,
    overflow: "hidden",
  },
  boardThumb: {
    aspectRatio: dashboard.boardThumbAspectRatio,
    backgroundColor: colors.bgAlt,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  boardThumbImage: {
    width: "100%",
    height: "100%",
  },
  boardCardBody: {
    padding: spacing.md,
    gap: spacing.xs,
    flex: 1,
  },
  boardCardTitle: { ...typography.section, color: colors.text },
  boardCardMeta: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: "auto",
  },

  emptyWrap: {
    alignItems: "center",
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: iconSizes.empty },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyMsg: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  assignmentPanel: {
    paddingVertical: spacing.md,
    gap: spacing.none,
  },
  assignmentTitle: {
    ...typography.subtitle,
    color: colors.text,
  },
  assignmentList: {
    paddingBottom: spacing.xs,
  },
  assignmentRows: {
    overflow: "hidden",
  },
  assignmentExpand: {
    minHeight: tapMin,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingVertical: spacing.xs,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  assignmentExpandText: {
    ...typography.badge,
    color: colors.accent,
  },
  assignmentEmpty: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.md,
    textAlign: "center",
  },
  assignmentRow: {
    minHeight: tapMin,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.none,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  assignmentRowStatic: {
    backgroundColor: colors.transparent,
  },
  assignmentRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  assignmentMain: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  assignmentTitleText: {
    ...typography.label,
    color: colors.text,
  },
  assignmentSubtitleText: {
    ...typography.badge,
    color: colors.textMuted,
  },
  assignmentMeta: {
    alignItems: "flex-end",
    gap: spacing.xxs,
  },
  assignmentStatus: {
    ...typography.badge,
  },
  assignmentStatusMissing: {
    color: colors.danger,
  },
  assignmentStatusSubmitted: {
    color: colors.accent,
  },
  assignmentDate: {
    ...typography.micro,
    color: colors.textMuted,
  },
});
