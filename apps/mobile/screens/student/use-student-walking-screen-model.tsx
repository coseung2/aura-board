import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
import { claimStudentAttendanceReward } from "../../lib/student-attendance";
import { claimTitle } from "../../lib/titles";

import { studentRewardNumberFormatter as numberFormatter } from "./student-reward-format";

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

export function useStudentWalkingScreenModel() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string | string[] }>();
  const requestedView = Array.isArray(params.view)
    ? params.view[0]
    : params.view;
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
  const [classroomTopFive, setClassroomTopFive] = useState<
    ClassroomWalkingRank[]
  >([]);
  const [classroomRankRewards, setClassroomRankRewards] = useState<
    ClassroomRankReward[]
  >([]);
  const [classroomRankNextResetAt, setClassroomRankNextResetAt] = useState<
    string | null
  >(null);
  const [rankRewardPending, setRankRewardPending] = useState(false);
  const [status, setStatus] = useState<HealthConnectStatus>("unavailable");
  const [permissions, setPermissions] = useState<HealthConnectPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<
    "connect" | "sync" | "settings" | "attendance" | null
  >(null);
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

  const handleAuthError = useCallback(
    async (nextError: unknown) => {
      if (nextError instanceof ApiError && nextError.status === 401) {
        await clearSessionToken();
        router.replace(getUnifiedLoginRoute("student"));
        return true;
      }
      return false;
    },
    [router],
  );

  const syncWalkingData = useCallback(async () => {
    await readAndSyncWalkingDays();
    const snapshot = await fetchWalkingSnapshot(undefined, {
      forceRefresh: true,
    });
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

  const load = useCallback(
    async (syncNative = false, refresh = false) => {
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
        if (
          syncNative &&
          hasRequiredHealthConnectPermissions(nextPermissions)
        ) {
          await syncWalkingData();
        }
      } catch (nextError) {
        if (!(await handleAuthError(nextError))) {
          setError(
            localizedWalkingError(nextError, "걷기 기록을 불러오지 못했어요."),
          );
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [handleAuthError, syncWalkingData],
  );

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
        setError(
          localizedWalkingError(
            nextError,
            "걸음 수를 자동 동기화하지 못했어요.",
          ),
        );
      }
    } finally {
      silentSyncInFlight.current = false;
    }
  }, [handleAuthError, syncWalkingData]);

  useFocusEffect(
    useCallback(() => {
      void load(true);

      let previousAppState = AppState.currentState;
      const appStateSubscription = AppState.addEventListener(
        "change",
        (nextAppState) => {
          if (previousAppState !== "active" && nextAppState === "active") {
            void syncLatestSilently();
          }
          previousAppState = nextAppState;
        },
      );

      return () => {
        appStateSubscription.remove();
      };
    }, [load, syncLatestSilently]),
  );

  useFocusEffect(
    useCallback(() => {
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
        )
          return;
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
      const appStateSubscription = AppState.addEventListener(
        "change",
        (nextState) => {
          if (nextState === "active") {
            setLiveStepDelta(0);
            void start();
          } else {
            stop();
            setLiveStepDelta(0);
          }
        },
      );

      return () => {
        disposed = true;
        stop();
        appStateSubscription.remove();
        setLiveStepDelta(0);
      };
    }, [connected]),
  );

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
        setError(
          localizedWalkingError(nextError, "걸음 수 연결에 실패했어요."),
        );
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

  const claimAttendance = useCallback(
    async (day: string) => {
      setBusy("attendance");
      setError(null);
      setMessage(null);
      try {
        const payload = await claimStudentAttendanceReward(day);
        setMonthlyAttendanceReward(payload.attendance);
        setMessage("출석 보상을 받았어요.");
      } catch (nextError) {
        if (!(await handleAuthError(nextError))) {
          setError(
            localizedWalkingError(nextError, "출석 보상을 받지 못했어요."),
          );
        }
      } finally {
        setBusy(null);
      }
    },
    [handleAuthError],
  );

  const claimWalkingTitle = useCallback(
    async (titleKey: string) => {
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
    },
    [handleAuthError],
  );

  const claimClassroomRankReward = useCallback(
    async (weekStart: string) => {
      if (rankRewardPending) return;
      setRankRewardPending(true);
      setError(null);
      setMessage(null);
      try {
        const payload = await apiFetch<{
          classroomRankReward: {
            weekStart: string;
            rank: number;
            amount: number;
            claimed: true;
          };
        }>("/api/student/walking/rewards/claim", {
          method: "POST",
          json: { kind: "classroom_rank", weekStart },
        });
        setClassroomRankRewards((currentRewards) =>
          currentRewards.filter(
            (reward) =>
              reward.weekStart !== payload.classroomRankReward.weekStart,
          ),
        );
        setMessage(`${payload.classroomRankReward.rank}등 보상을 받았어요.`);
      } catch (nextError) {
        if (!(await handleAuthError(nextError))) {
          setError(
            "순위 보상을 받지 못했어요. 순위를 새로고침한 뒤 다시 시도해 주세요.",
          );
        }
      } finally {
        setRankRewardPending(false);
      }
    },
    [handleAuthError, rankRewardPending],
  );

  const weekRange = getCurrentWalkingWeekRange();
  const days = useMemo(
    () => fillCurrentWalkingWeek(rows, weekRange),
    [rows, weekRange.weekStart, weekRange.weekEnd, weekRange.today],
  );
  const displayDays = useMemo(
    () =>
      days.map((row) =>
        row.day === weekRange.today
          ? { ...row, steps: row.steps + liveStepDelta }
          : row,
      ),
    [days, liveStepDelta, weekRange.today],
  );
  const today =
    displayDays.find((row) => row.day === weekRange.today) ?? displayDays[0];
  const totalSteps = displayDays.reduce(
    (sum, row) => (row.day <= weekRange.today ? sum + row.steps : sum),
    0,
  );
  const averageSteps = Math.round(totalSteps / days.length);
  const maxSteps = Math.max(
    1,
    ...displayDays
      .filter((row) => row.day <= weekRange.today)
      .map((row) => row.steps),
  );
  const hasSyncedData = rows.some(
    (row) => row.day >= weekRange.weekStart && row.day <= weekRange.today,
  );
  const showInitialLoading = loading && rows.length === 0;
  const showEmptyState = !loading && !error && !hasSyncedData;

  const healthServiceName =
    Platform.OS === "ios" ? "Apple 건강" : "Health Connect";
  const connectionLabel =
    Platform.OS === "web"
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

  return {
    connected,
    compactConnectionLabel,
    setSettingsVisible,
    activeView,
    setActiveView,
    refreshing,
    load,
    status,
    error,
    message,
    loading,
    busy,
    openSettings,
    showInitialLoading,
    showEmptyState,
    hasSyncedData,
    today,
    totalSteps,
    averageSteps,
    displayDays,
    dayLabel,
    weekRange,
    maxSteps,
    classroomTopFive,
    classroomRankRewards,
    classroomRankNextResetAt,
    rankRewardPending,
    claimClassroomRankReward,
    policy,
    dailyStepRewards,
    monthlyAttendanceReward,
    claimAttendance,
    weeklyStepRewards,
    representativeSlime,
    setDailyStepRewards,
    setWeeklyStepRewards,
    titles,
    claimingTitleKey,
    claimWalkingTitle,
    settingsVisible,
    connectionLabel,
    sync,
    connect,
  } as const;
}

export type StudentWalkingScreenViewModel = ReturnType<
  typeof useStudentWalkingScreenModel
>;
