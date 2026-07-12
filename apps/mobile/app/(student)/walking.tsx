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
import { SafeAreaView } from "react-native-safe-area-context";
import { Footprints, RefreshCw, Settings, ShieldCheck } from "lucide-react-native";
import { ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import {
  fetchWalkingDays,
  fillRecentWalkingDays,
  getGrantedHealthConnectPermissions,
  getHealthConnectStatus,
  hasRequiredHealthConnectPermissions,
  isHealthConnectModuleAvailable,
  openHealthConnectSettings,
  readAndSyncWalkingDays,
  requestHealthConnectPermissions,
  type WalkingDay,
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
  spacing,
  tapMin,
  typography,
  walking,
} from "../../theme/tokens";
import { AppButton, AppHeader, SectionHeader } from "../../components/ui";

const numberFormatter = new Intl.NumberFormat("ko-KR");
const distanceFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function dayLabel(day: string, today: string) {
  if (day === today) return "오늘";
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(year, month - 1, date));
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
  const [status, setStatus] = useState<HealthConnectStatus>("unavailable");
  const [permissions, setPermissions] = useState<HealthConnectPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"connect" | "sync" | "settings" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = hasRequiredHealthConnectPermissions(permissions);

  const handleAuthError = useCallback(async (nextError: unknown) => {
    if (nextError instanceof ApiError && nextError.status === 401) {
      await clearSessionToken();
      router.replace("/(student)/login");
      return true;
    }
    return false;
  }, [router]);

  const load = useCallback(async (syncNative = false, refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const cloudRows = await fetchWalkingDays(7);
      setRows(cloudRows);

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
        setRows(await readAndSyncWalkingDays(7));
      }
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) {
        setError(localizedWalkingError(nextError, "걷기 기록을 불러오지 못했어요."));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [handleAuthError]);

  useFocusEffect(useCallback(() => {
    void load(true);
  }, [load]));

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
      setRows(await readAndSyncWalkingDays(7));
      setStatus("available");
      setMessage("Health Connect 연결과 첫 동기화를 완료했어요.");
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) {
        setError(localizedWalkingError(nextError, "Health Connect 연결에 실패했어요."));
      }
    } finally {
      setBusy(null);
    }
  }, [handleAuthError]);

  const sync = useCallback(async () => {
    setBusy("sync");
    setError(null);
    setMessage(null);
    try {
      setRows(await readAndSyncWalkingDays(7));
      setMessage("최근 7일 걷기 기록을 동기화했어요.");
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) {
        setError(localizedWalkingError(nextError, "동기화하지 못했어요."));
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

  const days = useMemo(() => fillRecentWalkingDays(rows, 7), [rows]);
  const today = days[days.length - 1];
  const totalSteps = days.reduce((sum, row) => sum + row.steps, 0);
  const totalDistance = days.reduce((sum, row) => sum + row.distanceMeters, 0);
  const averageSteps = Math.round(totalSteps / days.length);
  const maxSteps = Math.max(1, ...days.map((row) => row.steps));
  const hasSyncedData = rows.length > 0;
  const showInitialLoading = loading && rows.length === 0;
  const showEmptyState = !loading && !error && !hasSyncedData;

  const connectionLabel = Platform.OS !== "android"
    ? "Android에서 동기화 가능"
    : !isHealthConnectModuleAvailable()
      ? "새 Android 앱 빌드 필요"
      : status === "needs_update"
        ? "Health Connect 업데이트 필요"
        : status === "unavailable"
          ? "Health Connect 사용 불가"
          : connected
            ? "Health Connect 연결됨"
            : "Health Connect 연결 필요";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="걷기" />
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
            title="Health Connect"
            titleAccessory={
              <ShieldCheck size={iconSizes.md} color={colors.accent} accessible={false} />
            }
          />
          <Text style={styles.connectionStatus}>{connectionLabel}</Text>
          <Text style={styles.muted}>
            걸음 수와 이동 거리의 날짜별 합계만 저장하며 GPS 경로는 저장하지 않아요.
          </Text>
        </View>

        {status === "available" && !connected ? (
          <View style={styles.buttonRow}>
            <AppButton
              loading={busy === "connect"}
              style={styles.flexButton}
              onPress={() => void connect()}
              accessibilityLabel="Health Connect 연결"
            >
              Health Connect 연결
            </AppButton>
            <AppButton
              variant="secondary"
              style={styles.flexButton}
              loading={busy === "settings"}
              onPress={() => void openSettings()}
              accessibilityLabel="Health Connect 권한 관리"
            >
              권한 관리
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
              권한 관리
            </AppButton>
          </View>
        ) : null}

        {status === "needs_update" ? (
          <AppButton loading={busy === "settings"} onPress={() => void openSettings()}>
            Health Connect 업데이트
          </AppButton>
        ) : null}

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

        {showEmptyState ? (
          <View style={styles.emptySection} accessible accessibilityRole="text">
            <Text style={styles.stateTitle}>아직 걷기 기록이 없어요.</Text>
            <Text style={styles.muted}>
              Android 앱에서 Health Connect를 연결하면 최근 기록이 여기에 표시돼요.
            </Text>
          </View>
        ) : null}

        {!showInitialLoading && hasSyncedData ? (
          <>
            <View style={styles.summarySection} accessibilityRole="summary">
              <SectionHeader title="요약" />
              <View style={styles.summaryRows}>
                <SummaryRow label="오늘" value={`${numberFormatter.format(today.steps)}걸음`} />
                <SummaryRow label="최근 7일" value={`${numberFormatter.format(totalSteps)}걸음`} />
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
                title="최근 7일"
                right={
                  loading ? (
                    <ActivityIndicator
                      color={colors.accent}
                      accessibilityLabel="걷기 기록을 동기화하는 중"
                    />
                  ) : (
                    <Footprints color={colors.accent} accessible={false} size={iconSizes.md} />
                  )
                }
              />
              <Text style={styles.muted}>날짜별 걸음 수</Text>

              <View style={styles.chartRows}>
                {days.map((row) => {
                  const label = dayLabel(row.day, today.day);
                  const value = numberFormatter.format(row.steps);
                  const barWidth = `${Math.round((row.steps / maxSteps) * 100)}%` as `${number}%`;
                  return (
                    <View
                      key={row.day}
                      style={styles.chartRow}
                      accessible
                      accessibilityRole="text"
                      accessibilityLabel={`${label}: ${value}걸음`}
                    >
                      <Text accessible={false} style={styles.dayLabel}>{label}</Text>
                      <View accessible={false} style={styles.barTrack}>
                        <View style={[styles.barFill, { width: barWidth }]} />
                      </View>
                      <Text accessible={false} style={styles.stepLabel}>{value}걸음</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.privacySection}>
          <SectionHeader title="동기화 및 개인정보" />
          <View style={styles.privacyRow}>
            <RefreshCw size={iconSizes.md} color={colors.accent} accessible={false} />
            <Text style={styles.privacyText}>
              Android에서 동기화한 결과는 웹 걷기 페이지에도 표시돼요.
            </Text>
          </View>
          <View style={styles.privacyRow}>
            <Settings size={iconSizes.md} color={colors.accent} accessible={false} />
            <Text style={styles.privacyText}>
              권한은 Health Connect 설정에서 언제든 철회할 수 있어요.
            </Text>
          </View>
        </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl + spacing.xxl,
    gap: spacing.md,
  },
  connectionSection: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
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
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  stateTitle: { ...typography.section, color: colors.text, textAlign: "center" },
  errorSection: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  emptySection: {
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  summarySection: { gap: spacing.sm },
  summaryRows: { borderTopWidth: borders.hairline, borderTopColor: colors.border },
  summaryRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  summaryRowLast: { borderBottomWidth: borders.none },
  summaryLabel: { ...typography.label, color: colors.textMuted },
  summaryValue: { ...typography.section, color: colors.text },
  chartSection: {
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  chartRows: { gap: spacing.md },
  chartRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dayLabel: {
    ...typography.micro,
    color: colors.textMuted,
    width: walking.chartDayLabelWidth,
  },
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
  privacySection: {
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  privacyText: { ...typography.label, color: colors.textMuted, flex: 1 },
});
