import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Footprints, ShieldCheck } from "lucide-react-native";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import {
  DEFAULT_WALKING_POLICY,
  fetchWalkingSnapshot,
  fillCurrentWalkingWeek,
  getCurrentWalkingWeekRange,
  getGrantedHealthConnectPermissions,
  getHealthConnectStatus,
  hasRequiredHealthConnectPermissions,
  isHealthConnectModuleAvailable,
  openHealthConnectSettings,
  readAndSyncWalkingDays,
  markWalkingAttendance,
  requestHealthConnectPermissions,
  type WalkingDay,
  type WalkingMonthlyAttendanceReward,
  type WalkingPolicy,
  type WalkingWeeklyStepRewards,
} from "../../lib/walking-health";
import type {
  HealthConnectPermission,
  HealthConnectStatus,
} from "../../modules/aura-board-health-connect/src/AuraBoardHealthConnect.types";
import {
  borders,
  colors,
  iconSizes,
  layout,
  pageChrome,
  radii,
  spacing,
  tapMin,
  typography,
  walking,
} from "../../theme/tokens";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  SectionHeader,
  SemanticNav,
  SemanticNavItem,
} from "../../components/ui";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";
import { WalkingAttendanceCalendar } from "../../components/walking-attendance-calendar";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const distanceFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const FOREGROUND_SYNC_INTERVAL_MS = 60_000;

type WalkingView = "record" | "missions";

function dayLabel(day: string, today: string) {
  if (day === today) return "오늘";
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(Date.UTC(year, month - 1, date, 12)));
  return `${month}월 ${date}일(${weekday})`;
}

function weekRangeLabel(weekStart: string, weekEnd: string) {
  return `${dayLabel(weekStart, "")}–${dayLabel(weekEnd, "")}`;
}

function localizedWalkingError(nextError: unknown, fallback: string) {
  if (nextError instanceof ApiError) {
    if (nextError.status === 403) return "걷기 기록을 볼 권한이 없어요.";
    if (nextError.status >= 500) {
      return "걷기 기록을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.";
    }
    return fallback;
  }

  if (nextError instanceof Error && /[가-힣]/u.test(nextError.message)) {
    return nextError.message;
  }

  return "네트워크에 연결되지 않았어요. 연결을 확인하고 다시 시도해 주세요.";
}

export default function StudentWalkingScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<WalkingDay[]>([]);
  const [policy, setPolicy] = useState<WalkingPolicy>(DEFAULT_WALKING_POLICY);
  const [monthlyAttendanceReward, setMonthlyAttendanceReward] =
    useState<WalkingMonthlyAttendanceReward | null>(null);
  const [weeklyStepRewards, setWeeklyStepRewards] =
    useState<WalkingWeeklyStepRewards | null>(null);
  const [status, setStatus] = useState<HealthConnectStatus>("unavailable");
  const [permissions, setPermissions] = useState<HealthConnectPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"connect" | "sync" | "settings" | "attendance" | null>(null);
  const silentSyncInFlight = useRef(false);
  const [activeView, setActiveView] = useState<WalkingView>("record");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = hasRequiredHealthConnectPermissions(permissions);

  const handleAuthError = useCallback(async (nextError: unknown) => {
    if (nextError instanceof ApiError && nextError.status === 401) {
      await clearSessionToken();
      router.replace(getUnifiedLoginRoute("student"));
      return true;
    }
    return false;
  }, [router]);

  const syncWalkingData = useCallback(async () => {
    await readAndSyncWalkingDays();
    const snapshot = await fetchWalkingSnapshot();
    setRows(snapshot.rows);
    setPolicy(snapshot.policy);
    setMonthlyAttendanceReward(snapshot.monthlyAttendanceReward);
    setWeeklyStepRewards(snapshot.weeklyStepRewards);
  }, []);

  const load = useCallback(async (syncNative = false, refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const cloudSnapshot = await fetchWalkingSnapshot();
      setRows(cloudSnapshot.rows);
      setPolicy(cloudSnapshot.policy);
      setMonthlyAttendanceReward(cloudSnapshot.monthlyAttendanceReward);
      setWeeklyStepRewards(cloudSnapshot.weeklyStepRewards);

      if (!isHealthConnectModuleAvailable()) {
        setStatus("unavailable");
        setPermissions([]);
        return;
      }

      const nextStatus = await getHealthConnectStatus();
      setStatus(nextStatus);
      if (nextStatus !== "available") {
        setPermissions([]);
        return;
      }

      const nextPermissions = await getGrantedHealthConnectPermissions();
      setPermissions(nextPermissions);
      if (syncNative && hasRequiredHealthConnectPermissions(nextPermissions)) {
        await syncWalkingData();
      }
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) {
        setError(localizedWalkingError(nextError, "걷기 기록을 불러오지 못했어요."));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [handleAuthError, syncWalkingData]);

  const syncLatestSilently = useCallback(async () => {
    if (silentSyncInFlight.current || !isHealthConnectModuleAvailable()) return;

    silentSyncInFlight.current = true;
    try {
      const nextPermissions = await getGrantedHealthConnectPermissions();
      setPermissions(nextPermissions);
      if (hasRequiredHealthConnectPermissions(nextPermissions)) {
        await syncWalkingData();
      }
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) {
        setError(localizedWalkingError(nextError, "걸음 수를 자동 동기화하지 못했어요."));
      }
    } finally {
      silentSyncInFlight.current = false;
    }
  }, [handleAuthError, syncWalkingData]);

  useFocusEffect(useCallback(() => {
    void load(true);

    let previousAppState = AppState.currentState;
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void syncLatestSilently();
    }, FOREGROUND_SYNC_INTERVAL_MS);
    const appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
      if (previousAppState !== "active" && nextAppState === "active") {
        void syncLatestSilently();
      }
      previousAppState = nextAppState;
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [load, syncLatestSilently]));

  const connect = useCallback(async () => {
    setBusy("connect");
    setError(null);
    setMessage(null);
    try {
      const granted = await requestHealthConnectPermissions();
      setPermissions(granted);
      if (!hasRequiredHealthConnectPermissions(granted)) {
        setError(
          "권한을 허용하지 않아 연결되지 않았어요. 권한 관리에서 다시 허용할 수 있어요.",
        );
        return;
      }
      await syncWalkingData();
      setStatus("available");
      setMessage(
        Platform.OS === "ios"
          ? "권한을 요청했어요. 걸음 수가 보이지 않으면 Apple 건강 앱에서 권한을 확인해 주세요."
          : "Health Connect 연결을 완료했어요.",
      );
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) {
        setError(localizedWalkingError(nextError, "Health Connect 연결에 실패했어요."));
      }
    } finally {
      setBusy(null);
    }
  }, [handleAuthError, syncWalkingData]);

  const sync = useCallback(async () => {
    setBusy("sync");
    setError(null);
    setMessage(null);
    try {
      await syncWalkingData();
      setMessage("이번 주 걷기 기록을 동기화했어요.");
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) {
        setError(localizedWalkingError(nextError, "동기화하지 못했어요."));
      }
    } finally {
      setBusy(null);
    }
  }, [handleAuthError, syncWalkingData]);

  const markAttendance = useCallback(async (days: string[]) => {
    if (days.length === 0) return;
    setBusy("attendance");
    setError(null);
    setMessage(null);
    try {
      const snapshot = await markWalkingAttendance(days);
      setRows(snapshot.rows);
      setPolicy(snapshot.policy);
      setMonthlyAttendanceReward(snapshot.monthlyAttendanceReward);
      setWeeklyStepRewards(snapshot.weeklyStepRewards);
      setMessage("출석을 체크했어요.");
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) {
        setError(localizedWalkingError(nextError, "출석 체크에 실패했어요."));
      }
    } finally {
      setBusy(null);
    }
  }, [handleAuthError]);

  const openSettings = useCallback(async () => {
    setBusy("settings");
    setError(null);
    try {
      await openHealthConnectSettings();
    } catch (nextError) {
      setError(localizedWalkingError(nextError, "설정을 열지 못했어요."));
    } finally {
      setBusy(null);
    }
  }, []);

  const weekRange = getCurrentWalkingWeekRange();
  const days = useMemo(() => fillCurrentWalkingWeek(rows, weekRange), [
    rows,
    weekRange.weekStart,
    weekRange.weekEnd,
    weekRange.today,
  ]);
  const today = days.find((row) => row.day === weekRange.today) ?? days[0];
  const totalSteps = days.reduce(
    (sum, row) => (row.day <= weekRange.today ? sum + row.steps : sum),
    0,
  );
  const totalDistance = days.reduce(
    (sum, row) => (row.day <= weekRange.today ? sum + row.distanceMeters : sum),
    0,
  );
  const averageSteps = Math.round(totalSteps / days.length);
  const maxSteps = Math.max(
    1,
    ...days.filter((row) => row.day <= weekRange.today).map((row) => row.steps),
  );
  const hasSyncedData = rows.some(
    (row) => row.day >= weekRange.weekStart && row.day <= weekRange.today,
  );
  const showInitialLoading = loading && rows.length === 0;
  const showEmptyState = !loading && !error && !hasSyncedData;

  const healthServiceName = Platform.OS === "ios" ? "Apple 건강" : "Health Connect";
  const connectionLabel = Platform.OS === "web"
    ? "모바일 앱에서 걸음 수 사용 가능"
    : !isHealthConnectModuleAvailable()
      ? Platform.OS === "ios"
        ? "새 iPhone 앱 빌드 필요"
        : "새 Android 앱 빌드 필요"
      : status === "needs_update"
        ? "Health Connect 업데이트 필요"
        : status === "unavailable"
          ? `${healthServiceName} 사용 불가`
          : connected
            ? `${healthServiceName} 연결됨`
            : `${healthServiceName} 연결 필요`;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="걷기" right={<StudentHeaderActions />} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true, true)}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.connectionSection}>
          <SectionHeader
            title="걸음 수 연결"
            titleAccessory={
              <ShieldCheck size={iconSizes.md} color={colors.accent} accessible={false} />
            }
          />
          <Text style={styles.connectionStatus}>{connectionLabel}</Text>
        </View>

        {status === "available" && !connected ? (
          <View style={styles.buttonRow}>
            <AppButton
              loading={busy === "connect"}
              style={styles.flexButton}
              onPress={() => void connect()}
              accessibilityLabel="Health Connect 연결"
            >
              권한 연결
            </AppButton>
            <AppButton
              variant="secondary"
              style={styles.flexButton}
              loading={busy === "settings"}
              onPress={() => void openSettings()}
              accessibilityLabel="Health Connect 권한 관리"
            >
              {Platform.OS === "ios" ? "iPhone 설정" : "설정 열기"}
            </AppButton>
          </View>
        ) : null}

        {status === "available" && connected ? (
          <View style={styles.buttonRow}>
            <AppButton
              loading={busy === "sync"}
              style={styles.flexButton}
              onPress={() => void sync()}
            >
              지금 동기화
            </AppButton>
            <AppButton
              variant="secondary"
              style={styles.flexButton}
              loading={busy === "settings"}
              onPress={() => void openSettings()}
              accessibilityLabel="Health Connect 권한 관리"
            >
              {Platform.OS === "ios" ? "iPhone 설정" : "설정 열기"}
            </AppButton>
          </View>
        ) : null}

        <SemanticNav accessibilityLabel="걷기 활동 보기" style={styles.viewNav}>
          <SemanticNavItem
            style={styles.viewNavItem}
            selected={activeView === "record"}
            onPress={() => setActiveView("record")}
            accessibilityLabel="걷기 기록 보기"
          >
            걷기 기록
          </SemanticNavItem>
          <SemanticNavItem
            style={styles.viewNavItem}
            selected={activeView === "missions"}
            onPress={() => setActiveView("missions")}
            accessibilityLabel="걷기 미션 보기"
          >
            미션
          </SemanticNavItem>
        </SemanticNav>

        {status === "needs_update" ? (
          <AppButton loading={busy === "settings"} onPress={() => void openSettings()}>
            Health Connect 업데이트
          </AppButton>
        ) : null}

        {error ? (
          <View
            style={styles.errorSection}
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.error}>{error}</Text>
            <AppButton
              variant="secondary"
              loading={loading || refreshing}
              onPress={() => void load(true)}
              accessibilityLabel="걷기 기록 다시 시도"
            >
              다시 시도
            </AppButton>
          </View>
        ) : null}

        {message ? (
          <Text
            style={styles.notice}
            accessibilityLiveRegion="polite"
            accessibilityRole="text"
          >
            {message}
          </Text>
        ) : null}

        {activeView === "record" ? (
          <>

        {showInitialLoading ? (
          <View
            style={styles.stateSection}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="걷기 기록을 불러오는 중"
          >
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.stateTitle}>걷기 기록을 불러오는 중…</Text>
          </View>
        ) : null}

        {showEmptyState ? (
          <View style={styles.emptySection} accessible accessibilityRole="text">
            <Text style={styles.stateTitle}>아직 걷기 기록이 없어요.</Text>
            <Text style={styles.muted}>
              Android 앱에서 Health Connect를 연결하면 이번 주 기록이 여기에 표시돼요.
            </Text>
          </View>
        ) : null}

        {!showInitialLoading && hasSyncedData ? (
          <>
            <View style={styles.summarySection} accessibilityRole="summary">
              <SectionHeader title="요약" />
              <View style={styles.summaryRows}>
                <SummaryRow label="오늘" value={`${numberFormatter.format(today.steps)}걸음`} />
                <SummaryRow
                  label={`이번 주 · ${weekRangeLabel(weekRange.weekStart, weekRange.weekEnd)}`}
                  value={`${numberFormatter.format(totalSteps)}걸음`}
                />
                <SummaryRow label="하루 평균" value={`${numberFormatter.format(averageSteps)}걸음`} />
                <SummaryRow
                  label="이동 거리"
                  value={`${distanceFormatter.format(totalDistance / 1000)}km`}
                  last
                />
              </View>
            </View>

            <View style={styles.chartSection} accessible accessibilityRole="summary">
              <SectionHeader
                title="이번 주 걸음"
                right={
                  loading ? (
                    <ActivityIndicator
                      color={colors.accent}
                      accessibilityLabel="걷기 기록을 불러오는 중"
                    />
                  ) : (
                    <Footprints color={colors.accent} accessible={false} size={iconSizes.md} />
                  )
                }
              />
              <Text style={styles.muted}>
                {weekRangeLabel(weekRange.weekStart, weekRange.weekEnd)} · 날짜별 걸음 수
              </Text>

              <View style={styles.chartRows}>
                {days.map((row) => {
                  const label = dayLabel(row.day, today.day);
                  const isFuture = row.day > weekRange.today;
                  const displaySteps = isFuture ? 0 : row.steps;
                  const value = numberFormatter.format(displaySteps);
                  const barWidth = `${Math.round((displaySteps / maxSteps) * 100)}%` as `${number}%`;
                  return (
                    <View
                      key={row.day}
                      style={styles.chartRow}
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={`${label}: ${value}걸음${
                        isFuture ? ", 아직 날짜가 오지 않았어요" : row.syncedAt ? "" : ", 미동기화"
                      }`}
                    >
                      <Text accessible={false} style={[styles.dayLabel, isFuture && styles.futureDayLabel]}>
                        {label}
                      </Text>
                      <View accessible={false} style={styles.barTrack}>
                        <View style={[styles.barFill, { width: barWidth }]} />
                      </View>
                      <Text accessible={false} style={styles.stepLabel}>
                        {isFuture ? "—" : `${value}걸음`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        ) : null}
          </>
        ) : (
          <WalkingMissionPanel
            todaySteps={today.steps}
            dailyGoal={policy.stepThreshold}
            dailyRewardAmount={policy.dailyUnitAmount}
            dailyUnitCap={policy.dailyUnitCap}
            monthlyAttendanceReward={monthlyAttendanceReward}
            weeklyStepRewards={weeklyStepRewards}
            onWeeklyStepRewardsChange={setWeeklyStepRewards}
            attendanceBusy={busy === "attendance"}
            onAttendanceDays={(days) => void markAttendance(days)}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, last && styles.summaryRowLast]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function WalkingWeeklyRewardProgress({
  rewards,
  onChange,
}: {
  rewards: WalkingWeeklyStepRewards;
  onChange: (rewards: WalkingWeeklyStepRewards) => void;
}) {
  const [pendingTierKey, setPendingTierKey] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const graphMaxSteps = Math.max(
    1,
    rewards.maxSteps,
    rewards.totalSteps,
    ...rewards.tiers.map((tier) => tier.steps),
  );
  const progress = Math.min(rewards.totalSteps / graphMaxSteps, 1);
  const totalReward = rewards.tiers.reduce((sum, tier) => sum + tier.amount, 0);
  const claimedTotal = rewards.tiers
    .filter((tier) => tier.claimed)
    .reduce((sum, tier) => sum + tier.amount, 0);

  async function claimTier(tierKey: string) {
    const tier = rewards.tiers.find((candidate) => candidate.key === tierKey);
    if (!tier?.achieved || tier.claimed || pendingTierKey) return;
    setPendingTierKey(tierKey);
    setClaimError(null);
    try {
      const payload = await apiFetch<{
        tier: WalkingWeeklyStepRewards["tiers"][number];
      }>("/api/student/walking/rewards/claim", {
        method: "POST",
        json: { tierKey },
      });
      onChange({
        ...rewards,
        tiers: rewards.tiers.map((candidate) =>
          candidate.key === tierKey ? payload.tier : candidate,
        ),
      });
    } catch {
      setClaimError("보상을 받지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPendingTierKey(null);
    }
  }

  return (
    <View style={styles.weeklyRewardBlock}>
      <View style={styles.weeklyRewardHeader}>
        <Text style={styles.weeklyRewardTitle}>주간미션</Text>
        <Text style={styles.weeklyRewardAmount}>
          달성 보상 {numberFormatter.format(claimedTotal)}원 / {numberFormatter.format(totalReward)}원
        </Text>
      </View>
      <View style={styles.missionProgressLabels}>
        <Text style={styles.missionProgressText}>
          {numberFormatter.format(rewards.totalSteps)} / {numberFormatter.format(graphMaxSteps)}걸음
        </Text>
        <Text style={styles.missionProgressPercent}>
          {Math.round(progress * 100)}%
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`이번 주 ${numberFormatter.format(rewards.totalSteps)}걸음, 목표 ${numberFormatter.format(graphMaxSteps)}걸음`}
        accessibilityValue={{ min: 0, max: graphMaxSteps, now: rewards.totalSteps }}
        style={styles.weeklyRewardTrack}
      >
        <View style={[styles.weeklyRewardFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.dailyMilestones}>
        {rewards.tiers.map((tier) => {
          const state = tier.claimed
            ? "수령 완료"
            : pendingTierKey === tier.key
              ? "처리 중"
              : tier.achieved
                ? "받기"
                : "잠김";
          return (
            <View
              key={tier.key}
              style={styles.dailyMilestone}
            >
              <View style={styles.dailyMilestoneDot} />
              <Text style={styles.dailyMilestoneSteps}>
                {numberFormatter.format(tier.steps)}걸음
              </Text>
              <ControlPressable
                disabled={!tier.achieved || tier.claimed || pendingTierKey !== null}
                onPress={() => void claimTier(tier.key)}
                accessibilityLabel={`${numberFormatter.format(tier.steps)}걸음 보상 ${numberFormatter.format(tier.amount)}원, ${state}`}
                style={styles.weeklyRewardClaim}
              >
                <Text style={styles.dailyMilestoneAmount}>
                  {numberFormatter.format(tier.amount)}원
                </Text>
              </ControlPressable>
            </View>
          );
        })}
      </View>
      {claimError ? <Text style={styles.error}>{claimError}</Text> : null}
    </View>
  );
}

function WalkingMissionPanel({
  todaySteps,
  dailyGoal,
  dailyRewardAmount,
  dailyUnitCap,
  monthlyAttendanceReward,
  weeklyStepRewards,
  onWeeklyStepRewardsChange,
  attendanceBusy,
  onAttendanceDays,
}: {
  todaySteps: number;
  dailyGoal: number;
  dailyRewardAmount: number;
  dailyUnitCap: number;
  monthlyAttendanceReward: WalkingMonthlyAttendanceReward | null;
  weeklyStepRewards: WalkingWeeklyStepRewards | null;
  onWeeklyStepRewardsChange: (rewards: WalkingWeeklyStepRewards | null) => void;
  attendanceBusy: boolean;
  onAttendanceDays: (days: string[]) => void;
}) {
  const safeDailyGoal = Math.max(1, dailyGoal);
  const safeDailyUnitCap = Math.min(4, Math.max(1, dailyUnitCap));
  const dailyMaxSteps = safeDailyGoal * safeDailyUnitCap;
  const dailyProgress = Math.min(todaySteps / dailyMaxSteps, 1);
  const dailyMilestones = Array.from(
    { length: safeDailyUnitCap },
    (_, index) => ({
      steps: safeDailyGoal * (index + 1),
      amount: dailyRewardAmount,
    }),
  );

  return (
    <View style={styles.missionSection} accessibilityRole="summary">
      {monthlyAttendanceReward ? (
        <WalkingAttendanceCalendar
          reward={monthlyAttendanceReward}
          busy={attendanceBusy}
          onDayPress={(day) => onAttendanceDays([day])}
          onCatchUp={() => onAttendanceDays(monthlyAttendanceReward.eligibleAttendanceDays ?? [])}
        />
      ) : null}

      <View style={styles.missionBlock}>
        <View style={styles.missionHeader}>
          <Text style={styles.missionTitle}>일간미션</Text>
          <Text style={styles.missionStatus}>
            {todaySteps >= dailyMaxSteps ? "달성" : "진행 중"}
          </Text>
        </View>
        <View style={styles.missionProgressLabels}>
          <Text style={styles.missionProgressText}>
            {numberFormatter.format(todaySteps)} / {numberFormatter.format(dailyMaxSteps)}걸음
          </Text>
          <Text style={styles.missionProgressPercent}>
            {Math.round(dailyProgress * 100)}%
          </Text>
        </View>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="오늘 걸음 미션 진행률"
          accessibilityValue={{
            min: 0,
            max: dailyMaxSteps,
            now: todaySteps,
          }}
          style={styles.missionTrack}
        >
          <View style={[styles.missionFill, { width: `${dailyProgress * 100}%` }]} />
        </View>
        <View style={styles.dailyMilestones}>
          {dailyMilestones.map((milestone) => (
            <View key={milestone.steps} style={styles.dailyMilestone}>
              <View style={styles.dailyMilestoneDot} />
              <Text style={styles.dailyMilestoneSteps}>
                {numberFormatter.format(milestone.steps)}걸음
              </Text>
              <Text style={styles.dailyMilestoneAmount}>
                {numberFormatter.format(milestone.amount)}원
              </Text>
            </View>
          ))}
        </View>
      </View>

      {weeklyStepRewards ? (
        <WalkingWeeklyRewardProgress
          rewards={weeklyStepRewards}
          onChange={(rewards) => onWeeklyStepRewardsChange(rewards)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: pageChrome.contentStartGap,
    paddingBottom: spacing.xxxl + spacing.xxl,
    gap: spacing.xxl,
  },
  viewNav: {
    alignSelf: "stretch",
  },
  viewNavItem: {
    flex: 1,
  },
  connectionSection: {
    gap: spacing.sm,
  },
  connectionStatus: {
    ...typography.badge,
    color: colors.accentTintedText,
    textAlign: "right",
  },
  muted: { ...typography.label, color: colors.textMuted },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  flexButton: { flex: 1 },
  error: { ...typography.body, color: colors.danger },
  notice: { ...typography.body, color: colors.accentTintedText },
  stateSection: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  stateTitle: { ...typography.section, color: colors.text, textAlign: "center" },
  errorSection: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  emptySection: {
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  summarySection: { gap: spacing.sm },
  summaryRows: { gap: spacing.md },
  summaryRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  summaryRowLast: {},
  summaryLabel: { ...typography.label, color: colors.textMuted, flex: 1 },
  summaryValue: { ...typography.section, color: colors.text, flexShrink: 0 },
  weeklyRewardBlock: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  weeklyRewardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  weeklyRewardTitle: { ...typography.section, color: colors.text },
  weeklyRewardAmount: { ...typography.label, color: colors.accentTintedText },
  weeklyRewardTrack: {
    height: walking.chartBarHeight,
    backgroundColor: colors.accentTintedBg,
    overflow: "hidden",
  },
  weeklyRewardFill: { height: "100%", backgroundColor: colors.accent },
  weeklyRewardClaim: { alignItems: "center", gap: spacing.xs },
  chartSection: {
    gap: spacing.lg,
  },
  missionSection: {
    gap: spacing.md,
  },
  missionBlock: {
    gap: spacing.sm,
  },
  missionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  missionTitle: {
    ...typography.section,
    color: colors.text,
  },
  missionStatus: {
    ...typography.label,
    color: colors.accentTintedText,
  },
  missionProgressLabels: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  missionProgressText: {
    ...typography.label,
    color: colors.textMuted,
  },
  missionProgressPercent: { ...typography.label, color: colors.text },
  missionTrack: {
    height: walking.chartBarHeight,
    backgroundColor: colors.accentTintedBg,
    overflow: "hidden",
  },
  missionFill: {
    height: "100%",
    backgroundColor: colors.accent,
  },
  dailyMilestones: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  dailyMilestone: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: spacing.xs,
  },
  dailyMilestoneDot: {
    width: borders.medium,
    height: borders.medium,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  dailyMilestoneSteps: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
  },
  dailyMilestoneAmount: {
    ...typography.label,
    color: colors.text,
    textAlign: "center",
  },
  chartRows: { gap: spacing.md },
  chartRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dayLabel: {
    ...typography.micro,
    color: colors.textMuted,
    width: walking.chartDayLabelWidth,
  },
  futureDayLabel: { color: colors.textFaint },
  barTrack: {
    flex: 1,
    height: walking.chartBarHeight,
    backgroundColor: colors.accentTintedBg,
    overflow: "hidden",
  },
  barFill: { height: "100%", backgroundColor: colors.accent },
  stepLabel: {
    ...typography.micro,
    color: colors.text,
    width: walking.chartStepLabelWidth,
    textAlign: "right",
  },
});
