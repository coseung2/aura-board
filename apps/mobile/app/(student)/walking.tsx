import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Footprints, Settings } from "lucide-react-native";
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
  requestHealthConnectPermissions,
  startLiveStepUpdates,
  type WalkingDay,
  type ClassroomWalkingRank,
  type ClassroomRankReward,
  type WalkingDailyStepRewards,
  type WalkingMonthlyAttendanceReward,
  type WalkingPolicy,
  type WalkingRepresentativeSlime,
  type WalkingTitleProgress,
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
  AppModal,
  ControlPressable,
  MediaPressable,
  SectionHeader,
} from "../../components/ui";
import {
  ContentTab,
  ContentTabs,
} from "../../components/NavigationTabs";
import { StudentHeaderActions } from "../../components/StudentHeaderActions";
import { ClassroomTopFive } from "../../components/ClassroomTopFive";
import { MissionProgressTrack } from "../../components/MissionProgressTrack";
import { WalkingAttendanceCalendar } from "../../components/walking-attendance-calendar";
import { TitleCollection } from "../../components/TitleCollection";
import { claimStudentAttendanceReward } from "../../lib/student-attendance";
import { claimTitle } from "../../lib/titles";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const REWARD_CLAIM_BUTTON_IMAGE = require("../../assets/walking/reward-claim-button.png");
const DISABLED_REWARD_CLAIM_BUTTON_IMAGE = require("../../assets/walking/reward-claim-button-disabled.png");
const REWARD_COIN_IMAGE = require("../../assets/walking/reward-coin.png");

type WalkingView = "record" | "missions" | "titles";

function dayLabel(day: string, today: string) {
  if (day === today) return "오늘";
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(Date.UTC(year, month - 1, date, 12)));
  return `${month}월 ${date}일(${weekday})`;
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
  const params = useLocalSearchParams<{ view?: string | string[] }>();
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view;
  const [rows, setRows] = useState<WalkingDay[]>([]);
  const [policy, setPolicy] = useState<WalkingPolicy>(DEFAULT_WALKING_POLICY);
  const [monthlyAttendanceReward, setMonthlyAttendanceReward] =
    useState<WalkingMonthlyAttendanceReward | null>(null);
  const [titles, setTitles] = useState<WalkingTitleProgress[]>([]);
  const [claimingTitleKey, setClaimingTitleKey] = useState<string | null>(null);
  const [dailyStepRewards, setDailyStepRewards] =
    useState<WalkingDailyStepRewards | null>(null);
  const [weeklyStepRewards, setWeeklyStepRewards] =
    useState<WalkingWeeklyStepRewards | null>(null);
  const [representativeSlime, setRepresentativeSlime] =
    useState<WalkingRepresentativeSlime | null>(null);
  const [classroomTopFive, setClassroomTopFive] = useState<ClassroomWalkingRank[]>([]);
  const [classroomRankRewards, setClassroomRankRewards] =
    useState<ClassroomRankReward[]>([]);
  const [classroomRankNextResetAt, setClassroomRankNextResetAt] = useState<string | null>(null);
  const [rankRewardPending, setRankRewardPending] = useState(false);
  const [status, setStatus] = useState<HealthConnectStatus>("unavailable");
  const [permissions, setPermissions] = useState<HealthConnectPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"connect" | "sync" | "settings" | "attendance" | null>(null);
  const silentSyncInFlight = useRef(false);
  const [liveStepDelta, setLiveStepDelta] = useState(0);
  const [activeView, setActiveView] = useState<WalkingView>(
    requestedView === "missions" ? "missions" : "record",
  );
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = hasRequiredHealthConnectPermissions(permissions);

  useEffect(() => {
    if (
      requestedView === "record" ||
      requestedView === "missions" ||
      requestedView === "titles"
    ) {
      setActiveView(requestedView);
    }
  }, [requestedView]);

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
    const snapshot = await fetchWalkingSnapshot(undefined, { forceRefresh: true });
    setRows(snapshot.rows);
    setPolicy(snapshot.policy);
    setMonthlyAttendanceReward(snapshot.monthlyAttendanceReward);
    setDailyStepRewards(snapshot.dailyStepRewards);
    setWeeklyStepRewards(snapshot.weeklyStepRewards);
    setRepresentativeSlime(snapshot.representativeSlime);
    setTitles(snapshot.titles);
    setClassroomTopFive(snapshot.classroomTopFive);
    setClassroomRankRewards(snapshot.classroomRankRewards);
    setClassroomRankNextResetAt(snapshot.classroomRankNextResetAt);
    setLiveStepDelta(0);
  }, []);

  const load = useCallback(async (syncNative = false, refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const cloudSnapshot = await fetchWalkingSnapshot(undefined, {
        forceRefresh: refresh,
      });
      setRows(cloudSnapshot.rows);
        setPolicy(cloudSnapshot.policy);
        setMonthlyAttendanceReward(cloudSnapshot.monthlyAttendanceReward);
        setDailyStepRewards(cloudSnapshot.dailyStepRewards);
        setWeeklyStepRewards(cloudSnapshot.weeklyStepRewards);
        setRepresentativeSlime(cloudSnapshot.representativeSlime);
        setTitles(cloudSnapshot.titles);
        setClassroomTopFive(cloudSnapshot.classroomTopFive);
        setClassroomRankRewards(cloudSnapshot.classroomRankRewards);
        setClassroomRankNextResetAt(cloudSnapshot.classroomRankNextResetAt);
      if (!refresh) setLoading(false);

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
    const appStateSubscription = AppState.addEventListener("change", (nextAppState) => {
      if (previousAppState !== "active" && nextAppState === "active") {
        void syncLatestSilently();
      }
      previousAppState = nextAppState;
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [load, syncLatestSilently]));

  useFocusEffect(useCallback(() => {
    if (!connected || !isHealthConnectModuleAvailable()) {
      setLiveStepDelta(0);
      return undefined;
    }

    let disposed = false;
    let starting = false;
    let liveUpdatesUnavailable = false;
    let stopLiveUpdates: (() => void) | null = null;

    const stop = () => {
      stopLiveUpdates?.();
      stopLiveUpdates = null;
    };
    const start = async () => {
      if (
        disposed ||
        starting ||
        liveUpdatesUnavailable ||
        stopLiveUpdates ||
        AppState.currentState !== "active"
      ) return;
      starting = true;
      const nextStop = await startLiveStepUpdates(({ delta }) => {
        if (!disposed && Number.isInteger(delta) && delta > 0) {
          setLiveStepDelta((current) => current + delta);
        }
      });
      starting = false;
      if (!nextStop) liveUpdatesUnavailable = true;

      if (disposed || AppState.currentState !== "active") nextStop?.();
      else stopLiveUpdates = nextStop;
    };

    setLiveStepDelta(0);
    void start();
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        setLiveStepDelta(0);
        void start();
      } else {
        stop();
        setLiveStepDelta(0);
      }
    });

    return () => {
      disposed = true;
      stop();
      appStateSubscription.remove();
      setLiveStepDelta(0);
    };
  }, [connected]));

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
          : "걸음 수 연결을 완료했어요.",
      );
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) {
        setError(localizedWalkingError(nextError, "걸음 수 연결에 실패했어요."));
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

  const claimAttendance = useCallback(async (day: string) => {
    setBusy("attendance");
    setError(null);
    setMessage(null);
    try {
      const payload = await claimStudentAttendanceReward(day);
      setMonthlyAttendanceReward(payload.attendance);
      setMessage("출석 보상을 받았어요.");
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) {
        setError(localizedWalkingError(nextError, "출석 보상을 받지 못했어요."));
      }
    } finally {
      setBusy(null);
    }
  }, [handleAuthError]);

  const claimWalkingTitle = useCallback(async (titleKey: string) => {
    setClaimingTitleKey(titleKey);
    setError(null);
    setMessage(null);
    try {
      const payload = await claimTitle(titleKey);
      setTitles(payload.titles);
      setMessage("칭호를 받았어요. 펫 꾸미기에서 붙일 수 있어요.");
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) {
        setError(localizedWalkingError(nextError, "칭호를 받지 못했어요."));
      }
    } finally {
      setClaimingTitleKey(null);
    }
  }, [handleAuthError]);

  const claimClassroomRankReward = useCallback(async (weekStart: string) => {
    if (rankRewardPending) return;
    setRankRewardPending(true);
    setError(null);
    setMessage(null);
    try {
      const payload = await apiFetch<{
        classroomRankReward: { weekStart: string; rank: number; amount: number; claimed: true };
      }>("/api/student/walking/rewards/claim", {
        method: "POST",
        json: { kind: "classroom_rank", weekStart },
      });
      setClassroomRankRewards((currentRewards) =>
        currentRewards.filter(
          (reward) => reward.weekStart !== payload.classroomRankReward.weekStart,
        ),
      );
      setMessage(`${payload.classroomRankReward.rank}등 보상을 받았어요.`);
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) {
        setError("순위 보상을 받지 못했어요. 순위를 새로고침한 뒤 다시 시도해 주세요.");
      }
    } finally {
      setRankRewardPending(false);
    }
  }, [handleAuthError, rankRewardPending]);

  const weekRange = getCurrentWalkingWeekRange();
  const days = useMemo(() => fillCurrentWalkingWeek(rows, weekRange), [
    rows,
    weekRange.weekStart,
    weekRange.weekEnd,
    weekRange.today,
  ]);
  const displayDays = useMemo(
    () => days.map((row) =>
      row.day === weekRange.today
        ? { ...row, steps: row.steps + liveStepDelta }
        : row
    ),
    [days, liveStepDelta, weekRange.today],
  );
  const today = displayDays.find((row) => row.day === weekRange.today) ?? displayDays[0];
  const totalSteps = displayDays.reduce(
    (sum, row) => (row.day <= weekRange.today ? sum + row.steps : sum),
    0,
  );
  const averageSteps = Math.round(totalSteps / days.length);
  const maxSteps = Math.max(
    1,
    ...displayDays.filter((row) => row.day <= weekRange.today).map((row) => row.steps),
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
        ? "새 iPhone 앱 업데이트 필요"
        : "새 Android 앱 업데이트 필요"
      : status === "needs_update"
        ? "건강 데이터 업데이트 필요"
        : status === "unavailable"
          ? `${healthServiceName} 사용 불가`
          : connected
            ? `${healthServiceName} 연결됨`
            : `${healthServiceName} 연결 필요`;
  const compactConnectionLabel = connected ? "연결됨" : "연결 필요";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader
        title="걷기"
        right={
          <View style={styles.headerActions}>
            <View style={styles.headerConnection}>
              <View
                style={[
                  styles.connectionDot,
                  connected && styles.connectionDotConnected,
                ]}
              />
              <Text style={styles.headerConnectionText}>{compactConnectionLabel}</Text>
            </View>
            <ControlPressable
              style={styles.headerIconButton}
              hitSlop={spacing.sm}
              onPress={() => setSettingsVisible(true)}
              accessibilityLabel="걷기 연동 설정"
            >
              <Settings size={iconSizes.md} color={colors.textMuted} accessible={false} />
            </ControlPressable>
            <StudentHeaderActions />
          </View>
        }
        rightStyle={styles.headerActionsWrap}
      />
      <View style={styles.pageTabsRow}>
        <ContentTabs
          accessibilityLabel="걷기 활동 보기"
          style={styles.viewNav}
        >
          <ContentTab
            style={styles.viewNavItem}
            selected={activeView === "record"}
            onPress={() => setActiveView("record")}
            accessibilityLabel="걷기 기록 보기"
          >
            걷기 기록
          </ContentTab>
          <ContentTab
            style={styles.viewNavItem}
            selected={activeView === "missions"}
            onPress={() => setActiveView("missions")}
            accessibilityLabel="걷기 미션 보기"
          >
            미션
          </ContentTab>
          <ContentTab
            style={styles.viewNavItem}
            selected={activeView === "titles"}
            onPress={() => setActiveView("titles")}
            accessibilityLabel="걷기 칭호 보기"
          >
            칭호
          </ContentTab>
        </ContentTabs>
      </View>
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
        {status === "needs_update" || error || message ? (
          <View style={styles.scrollLead}>
            {status === "needs_update" ? (
              <AppButton loading={busy === "settings"} onPress={() => void openSettings()}>
                건강 데이터 업데이트
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
          </View>
        ) : null}

        <View style={styles.tabContent}>
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
              Android 앱에서 건강 데이터를 연결하면 이번 주 기록이 여기에 표시돼요.
            </Text>
          </View>
        ) : null}

        {!showInitialLoading && hasSyncedData ? (
          <>
            <View style={styles.summarySection} accessibilityRole="summary">
              <SectionHeader title="요약" />
              <View style={styles.summaryRows}>
                <SummaryRow label="오늘" value={`${numberFormatter.format(today.steps)}걸음`} />
                <SummaryRow label="주간" value={`${numberFormatter.format(totalSteps)}걸음`} />
                <SummaryRow label="평균" value={`${numberFormatter.format(averageSteps)}걸음`} />
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

              <View style={styles.chartRows}>
                {displayDays.map((row) => {
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

            <ClassroomTopFive
              ranks={classroomTopFive.map((rank) => ({
                studentId: rank.studentId,
                studentName: rank.studentName,
                metricValue: rank.weeklySteps,
                isCurrent: rank.isCurrent,
                rewardAmount: rank.rewardAmount,
              }))}
              rankRewards={classroomRankRewards}
              nextResetAt={classroomRankNextResetAt}
              metricUnit="걸음"
              rewardPending={rankRewardPending}
              onClaimReward={(weekStart) => void claimClassroomRankReward(weekStart)}
            />
          </>
        ) : null}
            </>
          ) : activeView === "missions" ? (
            <WalkingMissionPanel
            todaySteps={today.steps}
            dailyGoal={policy.stepThreshold}
            dailyRewardAmount={policy.dailyUnitAmount}
            dailyUnitCap={policy.dailyUnitCap}
            dailyStepRewards={dailyStepRewards}
            monthlyAttendanceReward={monthlyAttendanceReward}
            attendanceBusy={busy === "attendance"}
            onClaimAttendance={(day) => void claimAttendance(day)}
            weeklyStepRewards={weeklyStepRewards}
            representativeSlime={representativeSlime}
            onDailyStepRewardsChange={setDailyStepRewards}
            onWeeklyStepRewardsChange={setWeeklyStepRewards}
            />
          ) : (
            <TitleCollection
            titles={titles}
            emptyHint="걸음 기록을 쌓으면 칭호를 얻을 수 있어요."
            claimingKey={claimingTitleKey}
            onClaim={(titleKey) => void claimWalkingTitle(titleKey)}
            />
          )}
        </View>
      </ScrollView>
      <AppModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        closeOnBackdropPress
        accessibilityLabel="걷기 연동 설정"
        sheetStyle={styles.settingsSheet}
      >
        <Text style={styles.settingsTitle}>걷기 연동</Text>
        <Text style={styles.settingsHelp}>상태: {connectionLabel}</Text>
        <Text style={styles.settingsHelp}>
          권한: {Platform.OS === "ios" ? "Apple 건강 걸음 수·동작 및 피트니스" : "걸음 수 읽기"}
        </Text>
        <Text style={styles.settingsHelp}>목적: 걷기 기록·보상·학급 순위</Text>
        <Text style={styles.settingsHelp}>
          관리: {Platform.OS === "ios" ? "Apple 건강·iPhone 설정" : "Health Connect 설정"}
        </Text>
        <View style={styles.settingsActions}>
          <AppButton
            variant="secondary"
            onPress={() => setSettingsVisible(false)}
          >
            나중에
          </AppButton>
          {status === "available" ? (
            <AppButton
              loading={busy === (connected ? "sync" : "connect")}
              onPress={() => void (connected ? sync() : connect())}
            >
              연결
            </AppButton>
          ) : null}
        </View>
      </AppModal>
    </SafeAreaView>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryRow} accessible accessibilityRole="text" accessibilityLabel={`${label} ${value}`}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function RewardClaimButton({
  disabled,
  muted = false,
  label,
  onPress,
  width,
}: {
  disabled: boolean;
  muted?: boolean;
  label: string;
  onPress: () => void;
  width?: number;
}) {
  const buttonWidth = width ?? walking.rewardClaimButtonWidth;
  return (
    <MediaPressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.rewardClaimButton, { width: buttonWidth }]}
    >
      <Image
        source={muted ? DISABLED_REWARD_CLAIM_BUTTON_IMAGE : REWARD_CLAIM_BUTTON_IMAGE}
        resizeMode="contain"
        style={[
          styles.rewardClaimButtonImage,
          { height: Math.max(tapMin * 0.72, buttonWidth * 0.5) },
        ]}
        accessible={false}
      />
    </MediaPressable>
  );
}

function RankRewardAmount({ amount, claimed = false }: { amount: number; claimed?: boolean }) {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={claimed ? `${numberFormatter.format(amount)}원 보상 수령 완료` : `${numberFormatter.format(amount)}원 보상`}
      style={[styles.rankRewardAmount, claimed && styles.rankRewardAmountClaimed]}
    >
      <Image
        source={REWARD_COIN_IMAGE}
        resizeMode="contain"
        style={styles.rankRewardCoin}
        accessible={false}
      />
      <Text style={[styles.rankRewardAmountText, claimed && styles.rankRewardAmountTextClaimed]}>
        ×{numberFormatter.format(amount)}
      </Text>
    </View>
  );
}


function claimButtonWidthFor(markerCount: number, trackWidth: number) {
  const count = Math.max(1, markerCount);
  const gap = spacing.xs;
  const available = Math.max(0, trackWidth - gap * Math.max(0, count - 1));
  const maxWidth = walking.rewardClaimButtonWidth;
  const minWidth = walking.rewardClaimButtonMinWidth;
  return Math.max(minWidth, Math.min(maxWidth, Math.floor(available / count)));
}

type MissionRewardMarker = {
  key: string;
  steps: number;
  amount: number;
  claimed: boolean;
  claimable: boolean;
  pending: boolean;
  onClaim: () => void;
};

function MissionRewardTrack({
  totalSteps,
  maxSteps,
  label,
  markers,
  representativeSlime,
}: {
  totalSteps: number;
  maxSteps: number;
  label: string;
  markers: MissionRewardMarker[];
  representativeSlime: WalkingRepresentativeSlime | null;
}) {
  const safeMaxSteps = Math.max(1, maxSteps);
  const [trackWidth, setTrackWidth] = useState(0);
  const claimButtonWidth = claimButtonWidthFor(markers.length, trackWidth);

  return (
    <View
      style={styles.missionRewardTrack}
      onLayout={(event) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        setTrackWidth((current) => (current === nextWidth ? current : nextWidth));
      }}
    >
      <MissionProgressTrack
        value={totalSteps}
        max={safeMaxSteps}
        markerValues={markers.map((marker) => marker.steps)}
        completedMarkerValues={markers
          .filter((marker) => marker.claimed)
          .map((marker) => marker.steps)}
        accessibilityLabel={label}
        representativeSlime={representativeSlime}
      />
      <View style={styles.dailyMilestones}>
        {markers.map((marker) => (
          <View key={marker.key} style={styles.dailyMilestone}>
            <Text style={styles.dailyMilestoneSteps}>
              {numberFormatter.format(marker.steps)}걸음
            </Text>
            <RankRewardAmount amount={marker.amount} />
            {marker.claimed ? (
              <Text style={styles.rewardClaimedLabel}>수령 완료</Text>
            ) : (
              <RewardClaimButton
                disabled={!marker.claimable || marker.pending}
                muted={!marker.claimable || marker.pending}
                onPress={marker.onClaim}
                width={claimButtonWidth}
                label={`${numberFormatter.format(marker.steps)}걸음 보상 ${numberFormatter.format(marker.amount)}원${
                  marker.claimable ? " 수령" : " 아직 수령할 수 없음"
                }`}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function WalkingWeeklyRewardProgress({
  rewards,
  onChange,
  representativeSlime,
}: {
  rewards: WalkingWeeklyStepRewards;
  onChange: (rewards: WalkingWeeklyStepRewards) => void;
  representativeSlime: WalkingRepresentativeSlime | null;
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
        json: { kind: "weekly", tierKey },
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
    <View style={styles.missionBlock}>
      <Text style={styles.missionTitle}>주간미션</Text>
      <View style={styles.missionProgressLabels}>
        <Text style={styles.missionProgressText}>
          {numberFormatter.format(rewards.totalSteps)} / {numberFormatter.format(graphMaxSteps)}걸음
        </Text>
        <Text style={styles.missionProgressPercent}>
          {Math.round(progress * 100)}%
        </Text>
      </View>
      <MissionRewardTrack
        totalSteps={rewards.totalSteps}
        maxSteps={graphMaxSteps}
        label={`이번 주 ${numberFormatter.format(rewards.totalSteps)}걸음, 목표 ${numberFormatter.format(graphMaxSteps)}걸음`}
        markers={rewards.tiers.map((tier) => ({
          key: tier.key,
          steps: tier.steps,
          amount: tier.amount,
          claimed: tier.claimed,
          claimable: tier.achieved && !tier.claimed && pendingTierKey === null,
          pending: pendingTierKey !== null,
          onClaim: () => void claimTier(tier.key),
        }))}
        representativeSlime={representativeSlime}
      />
      {claimError ? <Text style={styles.error}>{claimError}</Text> : null}
    </View>
  );
}

function WalkingMissionPanel({
  todaySteps,
  dailyGoal,
  dailyRewardAmount,
  dailyUnitCap,
  dailyStepRewards,
  monthlyAttendanceReward,
  attendanceBusy,
  onClaimAttendance,
  weeklyStepRewards,
  representativeSlime,
  onDailyStepRewardsChange,
  onWeeklyStepRewardsChange,
}: {
  todaySteps: number;
  dailyGoal: number;
  dailyRewardAmount: number;
  dailyUnitCap: number;
  dailyStepRewards: WalkingDailyStepRewards | null;
  monthlyAttendanceReward: WalkingMonthlyAttendanceReward | null;
  attendanceBusy: boolean;
  onClaimAttendance: (day: string) => void;
  weeklyStepRewards: WalkingWeeklyStepRewards | null;
  representativeSlime: WalkingRepresentativeSlime | null;
  onDailyStepRewardsChange: (rewards: WalkingDailyStepRewards | null) => void;
  onWeeklyStepRewardsChange: (rewards: WalkingWeeklyStepRewards | null) => void;
}) {
  const safeDailyGoal = Math.max(1, dailyGoal);
  const safeDailyUnitCap = Math.min(4, Math.max(1, dailyUnitCap));
  const dailyMaxSteps = safeDailyGoal * safeDailyUnitCap;
  // Keep the daily marker on the exact same server-calculated progress source
  // that drives daily reward eligibility, just as the weekly marker does.
  const dailyTotalSteps = dailyStepRewards?.totalSteps ?? todaySteps;
  const dailyProgress = Math.min(dailyTotalSteps / dailyMaxSteps, 1);
  const dailyMilestones = Array.from(
    { length: safeDailyUnitCap },
    (_, index) => ({
      steps: safeDailyGoal * (index + 1),
      amount: dailyRewardAmount,
    }),
  );
  const [pendingDailyUnit, setPendingDailyUnit] = useState<number | null>(null);
  const [dailyClaimError, setDailyClaimError] = useState<string | null>(null);

  async function claimDailyUnit(unit: number) {
    const tier = dailyStepRewards?.tiers.find((candidate) => candidate.unit === unit);
    if (!tier?.claimable || pendingDailyUnit !== null) return;
    const currentDailyRewards = dailyStepRewards;
    if (!currentDailyRewards) return;
    setPendingDailyUnit(unit);
    setDailyClaimError(null);
    try {
      const payload = await apiFetch<{
        dailyTier: WalkingDailyStepRewards["tiers"][number];
      }>("/api/student/walking/rewards/claim", {
        method: "POST",
        json: { kind: "daily", unit },
      });
      onDailyStepRewardsChange({
        ...currentDailyRewards,
        tiers: currentDailyRewards.tiers.map((candidate) =>
          candidate.unit === unit ? payload.dailyTier : candidate,
        ),
      });
    } catch {
      setDailyClaimError("보상을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setPendingDailyUnit(null);
    }
  }

  return (
    <View style={styles.missionSection} accessibilityRole="summary">
      {monthlyAttendanceReward ? (
        <WalkingAttendanceCalendar
          reward={monthlyAttendanceReward}
          busy={attendanceBusy}
          onDayPress={onClaimAttendance}
        />
      ) : null}

      <View style={styles.missionBlock}>
        <Text style={styles.missionTitle}>일간미션</Text>
        <View style={styles.missionProgressLabels}>
          <Text style={styles.missionProgressText}>
            {numberFormatter.format(dailyTotalSteps)} / {numberFormatter.format(dailyMaxSteps)}걸음
          </Text>
          <Text style={styles.missionProgressPercent}>
            {Math.round(dailyProgress * 100)}%
          </Text>
        </View>
        <MissionRewardTrack
          totalSteps={dailyTotalSteps}
          maxSteps={dailyMaxSteps}
          label="오늘 걸음 미션 진행률"
          markers={dailyMilestones.map((milestone) => {
            const unit = Math.round(milestone.steps / safeDailyGoal);
            const tier = dailyStepRewards?.tiers.find((candidate) => candidate.unit === unit);
            return {
              key: `daily-${unit}`,
              steps: milestone.steps,
              amount: milestone.amount,
              claimed: tier?.claimed ?? false,
              claimable: tier?.claimable === true && pendingDailyUnit === null,
              pending: pendingDailyUnit !== null,
              onClaim: () => void claimDailyUnit(unit),
            };
          })}
          representativeSlime={representativeSlime}
        />
        {dailyClaimError ? <Text style={styles.error}>{dailyClaimError}</Text> : null}
      </View>

      {weeklyStepRewards ? (
        <WalkingWeeklyRewardProgress
          rewards={weeklyStepRewards}
          representativeSlime={representativeSlime}
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
    position: "relative",
  },
  tabContent: {
    width: "100%",
    minWidth: 0,
    gap: spacing.xxl,
  },
  // Keep activity tabs sticky above the ScrollView.
  pageTabsRow: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
  },
  // Only status/error/notice stay above the main content sections.
  scrollLead: {
    gap: spacing.sm,
  },
  headerActionsWrap: {
    gap: spacing.xs,
    maxWidth: "70%",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
  },
  headerConnection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: tapMin,
    paddingHorizontal: spacing.xs,
  },
  headerConnectionText: {
    ...typography.micro,
    color: colors.textMuted,
  },
  headerIconButton: {
    minWidth: tapMin,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  viewNav: {
    alignSelf: "stretch",
  },
  viewNavItem: {
    flex: 1,
  },
  connectionDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.textMuted,
  },
  connectionDotConnected: { backgroundColor: colors.statusOnline },
  muted: { ...typography.label, color: colors.textMuted },
  settingsSheet: { padding: spacing.xl, gap: spacing.md },
  settingsTitle: { ...typography.title, color: colors.text },
  settingsActions: { gap: spacing.sm },
  settingsHelp: { ...typography.label, color: colors.textMuted },
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
  summaryRows: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  summaryRow: {
    flex: 1,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  summaryLabel: { ...typography.label, color: colors.textMuted, textAlign: "center" },
  summaryValue: { ...typography.section, color: colors.text, textAlign: "center" },
  rankRewardAmount: {
    width: walking.classroomRankRewardWidth,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xxs,
    opacity: walking.classroomRankRewardMutedOpacity,
  },
  rankRewardAmountClaimed: { opacity: walking.classroomRankRewardClaimedOpacity },
  rankRewardCoin: {
    width: walking.rankRewardCoinSize,
    height: walking.rankRewardCoinSize,
  },
  rankRewardAmountText: {
    ...typography.micro,
    color: colors.text,
  },
  rankRewardAmountTextClaimed: { color: colors.textMuted },
  chartSection: {
    gap: spacing.lg,
  },
  missionSection: {
    gap: spacing.xxl,
  },
  missionBlock: {
    gap: spacing.sm,
  },
  missionTitle: {
    ...typography.section,
    color: colors.text,
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
  missionRewardTrack: {
    gap: spacing.xxs,
  },
  missionMarkerLabels: {
    height: spacing.xxl,
    position: "relative",
  },
  missionMarkerLabel: {
    position: "absolute",
    bottom: spacing.none,
    width: walking.chartStepLabelWidth,
    gap: spacing.none,
  },
  missionMarkerLabelStart: { alignItems: "flex-start" },
  missionMarkerLabelCenter: {
    marginLeft: -(walking.chartStepLabelWidth / 2),
    alignItems: "center",
  },
  missionMarkerLabelEnd: {
    marginLeft: -walking.chartStepLabelWidth,
    alignItems: "flex-end",
  },
  missionMarkerSteps: {
    ...typography.micro,
    color: colors.textMuted,
  },
  missionMarkerAmount: {
    ...typography.micro,
    color: colors.text,
  },
  dailyMilestones: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  dailyMilestone: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: spacing.xxs,
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
  rewardClaimButton: {
    minWidth: walking.rewardClaimButtonMinWidth,
    maxWidth: walking.rewardClaimButtonWidth,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardClaimButtonImage: {
    width: "100%",
    height: tapMin,
  },
  rewardClaimedLabel: {
    ...typography.micro,
    color: colors.accentTintedText,
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
