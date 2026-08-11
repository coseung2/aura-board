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
import { SectionNav, SectionNavItem } from "../../components/NavigationTabs";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";
import { resolvePetCardSceneGeometry } from "../../components/slime/slime-types";
import { SlimeSprite } from "../../components/slime/SlimeSprite";
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
import { styles } from "../../components/student-screens/student-home.styles";
import {
  DailyGamePanel,
  AssignmentPanel,
  WalletCardCompact,
} from "./student-home-presentation";
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
  const [dailyWalking, setDailyWalking] =
    useState<WalkingDailyStepRewards | null>(null);
  const [weeklyWalking, setWeeklyWalking] =
    useState<WalkingWeeklyStepRewards | null>(null);
  const [walkingRankRewardCount, setWalkingRankRewardCount] = useState(0);
  const [attendance, setAttendance] =
    useState<WalkingMonthlyAttendanceReward | null>(null);
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
      setPetHome(
        normalizeSlimeHome(
          await apiFetch<unknown>("/api/student/slimes", {
            cacheTtlMs: NAV_SHARED_CACHE_MS,
            forceRefresh: force,
          }),
        ),
      );
    } catch {
      setPetHome(null);
    }
  }, []);

  const loadDailyRewards = useCallback(async (force = false) => {
    setDailyRewardLoading(true);
    const [walkingResult, readingResult] = await Promise.allSettled([
      fetchWalkingSnapshot(undefined, { forceRefresh: force }),
      apiFetch<{
        weeklyMissionReward?: {
          claimableStepCount?: number;
          claimable?: boolean;
        } | null;
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
          onOpenAttendance={() =>
            router.push("/(student)/walking?view=missions" as Href)
          }
          onOpenWalkingMissions={() =>
            router.push("/(student)/walking?view=missions" as Href)
          }
          onOpenWalkingRank={() =>
            router.push("/(student)/walking?view=record" as Href)
          }
          onOpenReadingMissions={() =>
            router.push("/(student)/reading?view=missions" as Href)
          }
          onOpenReadingRank={() =>
            router.push("/(student)/reading?view=records" as Href)
          }
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
