import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Footprints, Settings } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ParentBottomNav } from "../../components/parent-bottom-nav";
import { ParentHeaderActions } from "../../components/parent-header-actions";
import {
  AppButton,
  AppHeader,
  AppModal,
  ControlPressable,
  SectionHeader,
} from "../../components/ui";
import { ApiError, getApiBase, parentApiFetch } from "../../lib/api";
import {
  fillCurrentWalkingWeek,
  getCurrentWalkingWeekRange,
  getGrantedHealthConnectPermissions,
  getHealthConnectStatus,
  hasRequiredHealthConnectPermissions,
  isHealthConnectModuleAvailable,
  openHealthConnectSettings,
  readWalkingDaysFromDevice,
  requestHealthConnectPermissions,
  type WalkingDay,
  type WalkingWeekRange,
} from "../../lib/walking-health";
import {
  clearParentSession,
  getUnifiedLoginRoute,
} from "../../lib/session";
import type { ParentWalkingResponse } from "../../lib/types";
import type {
  HealthConnectPermission,
  HealthConnectStatus,
} from "../../modules/aura-board-health-connect/src/AuraBoardHealthConnect.types";
import {
  borders,
  colors,
  iconSizes,
  pageChrome,
  parent,
  radii,
  spacing,
  tapMin,
  typography,
  walking,
} from "../../theme/tokens";

const numberFormatter = new Intl.NumberFormat("ko-KR");

type WalkingMetrics = {
  today: number;
  weekly: number;
  average: number;
};

function dayLabel(day: string, today: string) {
  if (day === today) return "오늘";
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(Date.UTC(year, month - 1, date, 12)));
  return `${month}월 ${date}일(${weekday})`;
}

function walkingMetrics(days: WalkingDay[], range: WalkingWeekRange): WalkingMetrics {
  const elapsed = days.filter((row) => row.day <= range.today);
  const weekly = elapsed.reduce((sum, row) => sum + row.steps, 0);
  return {
    today: days.find((row) => row.day === range.today)?.steps ?? 0,
    weekly,
    average: elapsed.length > 0 ? Math.round(weekly / elapsed.length) : 0,
  };
}

function walkingErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status >= 500) return "기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
    return fallback;
  }
  if (error instanceof Error && /[가-힣]/u.test(error.message)) return error.message;
  return fallback;
}

export default function ParentWalkingScreen() {
  const router = useRouter();
  const [week, setWeek] = useState<WalkingWeekRange>(getCurrentWalkingWeekRange());
  const [ownRows, setOwnRows] = useState<WalkingDay[]>([]);
  const [children, setChildren] = useState<ParentWalkingResponse["children"]>([]);
  const [status, setStatus] = useState<HealthConnectStatus>("unavailable");
  const [permissions, setPermissions] = useState<HealthConnectPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"connect" | "sync" | "settings" | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const connected = hasRequiredHealthConnectPermissions(permissions);

  const handleAuthError = useCallback(async (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      await clearParentSession();
      router.replace(getUnifiedLoginRoute("parent"));
      return true;
    }
    return false;
  }, [router]);

  const readOwnWalking = useCallback(async () => {
    const rows = await readWalkingDaysFromDevice();
    setOwnRows(rows);
  }, []);

  const load = useCallback(async (syncNative = true, refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setApiError(null);
    setHealthError(null);
    setMessage(null);

    try {
      const response = await parentApiFetch<ParentWalkingResponse>(
        __DEV__
          ? `${getApiBase()}/api/parent/walking`
          : "/api/parent/walking",
      );
      setWeek(response.week);
      setChildren(response.children);
    } catch (error) {
      if (await handleAuthError(error)) return;
      setApiError(walkingErrorMessage(error, "자녀 걷기 기록을 불러오지 못했어요."));
    }

    try {
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
        await readOwnWalking();
      }
    } catch (error) {
      setHealthError(walkingErrorMessage(error, "내 걷기 기록을 불러오지 못했어요."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [handleAuthError, readOwnWalking]);

  useFocusEffect(useCallback(() => {
    void load(true);
  }, [load]));

  const connect = useCallback(async () => {
    setBusy("connect");
    setHealthError(null);
    setMessage(null);
    try {
      const granted = await requestHealthConnectPermissions();
      setPermissions(granted);
      if (!hasRequiredHealthConnectPermissions(granted)) {
        setHealthError("걸음 수 권한이 필요해요. 권한 설정에서 허용해 주세요.");
        return;
      }
      await readOwnWalking();
      setStatus("available");
      setMessage("걷기 연동을 완료했어요.");
    } catch (error) {
      setHealthError(walkingErrorMessage(error, "걷기 연동에 실패했어요."));
    } finally {
      setBusy(null);
    }
  }, [readOwnWalking]);

  const sync = useCallback(async () => {
    setBusy("sync");
    setHealthError(null);
    setMessage(null);
    try {
      await readOwnWalking();
      setMessage("최신 걸음 수를 불러왔어요.");
    } catch (error) {
      setHealthError(walkingErrorMessage(error, "걸음 수를 불러오지 못했어요."));
    } finally {
      setBusy(null);
    }
  }, [readOwnWalking]);

  const openSettings = useCallback(async () => {
    setBusy("settings");
    setHealthError(null);
    try {
      await openHealthConnectSettings();
    } catch (error) {
      setHealthError(walkingErrorMessage(error, "권한 설정을 열지 못했어요."));
    } finally {
      setBusy(null);
    }
  }, []);

  const ownDays = useMemo(
    () => fillCurrentWalkingWeek(ownRows, week),
    [ownRows, week],
  );
  const ownMetrics = useMemo(() => walkingMetrics(ownDays, week), [ownDays, week]);
  const maxSteps = Math.max(
    1,
    ...ownDays.filter((row) => row.day <= week.today).map((row) => row.steps),
  );
  const hasOwnData = ownRows.some(
    (row) => row.day >= week.weekStart && row.day <= week.today,
  );

  const healthServiceName = Platform.OS === "ios" ? "Apple 건강" : "Health Connect";
  const connectionLabel = !isHealthConnectModuleAvailable()
    ? "새 앱 빌드 필요"
    : status === "needs_update"
      ? `${healthServiceName} 업데이트 필요`
      : status !== "available"
        ? `${healthServiceName} 사용 불가`
        : connected
          ? "연결됨"
          : "연결 필요";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="걷기" right={<ParentHeaderActions />} />
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
        <View style={styles.connectionOverlay}>
          <View style={[styles.connectionDot, connected && styles.connectionDotConnected]} />
          <Text style={styles.connectionText}>{connectionLabel}</Text>
          <ControlPressable
            style={styles.settingsButton}
            hitSlop={spacing.sm}
            onPress={() => setSettingsVisible(true)}
            accessibilityLabel="걷기 연동 설정"
          >
            <Settings size={iconSizes.sm} color={colors.textMuted} accessible={false} />
          </ControlPressable>
        </View>

        {apiError ? <StatusMessage tone="error" text={apiError} /> : null}
        {healthError ? <StatusMessage tone="error" text={healthError} /> : null}
        {message ? <StatusMessage tone="notice" text={message} /> : null}

        <View style={styles.section}>
          <SectionHeader
            title="내 기록"
            right={loading ? <ActivityIndicator color={colors.accent} /> : <Footprints color={colors.accent} size={iconSizes.md} />}
          />
          {loading && ownRows.length === 0 ? (
            <View style={styles.stateSection}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.muted}>걷기 기록을 불러오는 중이에요.</Text>
            </View>
          ) : !connected ? (
            <View style={styles.stateSection}>
              <Text style={styles.stateTitle}>내 걸음 수를 연결해 주세요.</Text>
              <Text style={styles.muted}>연결 후에는 기록이 이 기기에서만 조회돼요.</Text>
              {status === "available" ? (
                <AppButton onPress={() => void connect()} loading={busy === "connect"}>
                  걸음 수 연결
                </AppButton>
              ) : null}
            </View>
          ) : !hasOwnData ? (
            <View style={styles.stateSection}>
              <Text style={styles.stateTitle}>이번 주 걷기 기록이 없어요.</Text>
              <Text style={styles.muted}>{healthServiceName}에 기록이 있는지 확인해 주세요.</Text>
            </View>
          ) : (
            <>
              <MetricStrip metrics={ownMetrics} />
              <View style={styles.chartRows} accessibilityRole="summary">
                {ownDays.map((row) => {
                  const future = row.day > week.today;
                  const steps = future ? 0 : row.steps;
                  const width = `${Math.round((steps / maxSteps) * 100)}%` as `${number}%`;
                  return (
                    <View
                      key={row.day}
                      style={styles.chartRow}
                      accessible
                      accessibilityLabel={`${dayLabel(row.day, week.today)} ${numberFormatter.format(steps)}걸음`}
                    >
                      <Text style={[styles.dayLabel, future && styles.futureText]}>{dayLabel(row.day, week.today)}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width }]} />
                      </View>
                      <Text style={styles.stepLabel}>{future ? "-" : `${numberFormatter.format(steps)}걸음`}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        <View style={[styles.section, styles.childSection]}>
          <SectionHeader
            title="자녀 기록"
            right={<Text style={styles.sectionMeta}>{children.length}명</Text>}
          />
          {children.length === 0 ? (
            <Text style={styles.muted}>연결된 자녀가 없어요.</Text>
          ) : (
            <View accessibilityRole="list">
              {children.map((child) => {
                const days = fillCurrentWalkingWeek(child.rows, week);
                const metrics = walkingMetrics(days, week);
                return (
                  <View
                    key={child.studentId}
                    style={styles.childRow}
                    accessibilityRole="summary"
                    accessibilityLabel={`${child.name}, 오늘 ${metrics.today}걸음, 주간 ${metrics.weekly}걸음, 평균 ${metrics.average}걸음`}
                  >
                    <View style={styles.childHeading}>
                      <Text style={styles.childName}>{child.name}</Text>
                      <Text style={styles.childMeta} numberOfLines={1}>
                        {child.classroom?.name ?? "학급 미배정"}
                      </Text>
                    </View>
                    <MetricStrip metrics={metrics} compact />
                  </View>
                );
              })}
            </View>
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
        <Text style={styles.settingsTitle}>걷기 연동 설정</Text>
        <Text style={styles.muted}>{connectionLabel}</Text>
        {status === "available" ? (
          <View style={styles.settingsActions}>
            <AppButton
              loading={busy === (connected ? "sync" : "connect")}
              onPress={() => void (connected ? sync() : connect())}
            >
              {connected ? "지금 동기화" : "걸음 수 연결"}
            </AppButton>
            <AppButton
              variant="secondary"
              loading={busy === "settings"}
              onPress={() => void openSettings()}
            >
              권한 설정 열기
            </AppButton>
          </View>
        ) : (
          <Text style={styles.muted}>건강 데이터 연동은 네이티브 앱 빌드에서 사용할 수 있어요.</Text>
        )}
      </AppModal>
      <ParentBottomNav active="walking" />
    </SafeAreaView>
  );
}

function MetricStrip({ metrics, compact = false }: { metrics: WalkingMetrics; compact?: boolean }) {
  return (
    <View style={[styles.metricStrip, compact && styles.metricStripCompact]}>
      {([
        ["오늘", metrics.today],
        ["주간", metrics.weekly],
        ["평균", metrics.average],
      ] as const).map(([label, value]) => (
        <View key={label} style={styles.metricCell} accessible accessibilityLabel={`${label} ${value}걸음`}>
          <Text style={styles.metricLabel}>{label}</Text>
          <Text style={[styles.metricValue, compact && styles.metricValueCompact]} numberOfLines={1} adjustsFontSizeToFit>
            {numberFormatter.format(value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StatusMessage({ tone, text }: { tone: "error" | "notice"; text: string }) {
  return (
    <Text
      style={tone === "error" ? styles.error : styles.notice}
      accessibilityRole={tone === "error" ? "alert" : "text"}
      accessibilityLiveRegion="polite"
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: pageChrome.contentStartGap + spacing.xl,
    paddingBottom: spacing.xxxl + spacing.xxl,
    gap: spacing.xxl,
    position: "relative",
  },
  connectionOverlay: {
    position: "absolute",
    top: spacing.xxs,
    right: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  connectionDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.textMuted,
  },
  connectionDotConnected: { backgroundColor: colors.statusOnline },
  connectionText: { ...typography.micro, color: colors.textMuted },
  settingsButton: {
    width: iconSizes.lg,
    height: iconSizes.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  section: { gap: spacing.lg },
  childSection: { gap: spacing.none },
  sectionMeta: { ...typography.label, color: colors.textMuted },
  stateSection: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  stateTitle: { ...typography.section, color: colors.text, textAlign: "center" },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
  notice: { ...typography.body, color: colors.accentTintedText },
  metricStrip: { flexDirection: "row", alignItems: "stretch" },
  metricStripCompact: { flex: 1, minWidth: 0 },
  metricCell: {
    flex: 1,
    minWidth: 0,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  metricLabel: { ...typography.micro, color: colors.textMuted },
  metricValue: { ...typography.section, color: colors.text, textAlign: "center" },
  metricValueCompact: { ...typography.label },
  chartRows: { gap: spacing.md },
  chartRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dayLabel: { ...typography.micro, color: colors.textMuted, width: walking.chartDayLabelWidth },
  futureText: { color: colors.textFaint },
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
  childRow: {
    minHeight: tapMin + spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  childHeading: { width: parent.walkingChildLabelWidth, minWidth: 0, gap: spacing.xxs },
  childName: { ...typography.label, color: colors.text },
  childMeta: { ...typography.micro, color: colors.textMuted },
  settingsSheet: { padding: spacing.xl, gap: spacing.md },
  settingsTitle: { ...typography.title, color: colors.text },
  settingsActions: { gap: spacing.sm },
});
