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
import { apiFetch, ApiError } from "../../lib/api";
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
  layout,
  spacing,
  typography,
} from "../../theme/tokens";
import { AppButton, AppHeader, SurfaceCard } from "../../components/ui";

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
        setError(nextError instanceof Error ? nextError.message : "걷기 기록을 불러오지 못했어요.");
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
        setError("걸음 수와 거리 권한을 모두 허용해 주세요.");
        return;
      }
      setRows(await readAndSyncWalkingDays(7));
      setStatus("available");
      setMessage("Health Connect 연결과 첫 동기화를 완료했어요.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Health Connect 연결에 실패했어요.");
    } finally {
      setBusy(null);
    }
  }, []);

  const sync = useCallback(async () => {
    setBusy("sync");
    setError(null);
    setMessage(null);
    try {
      setRows(await readAndSyncWalkingDays(7));
      setMessage("최근 7일 걷기 기록을 동기화했어요.");
    } catch (nextError) {
      if (!(await handleAuthError(nextError))) {
        setError(nextError instanceof Error ? nextError.message : "동기화하지 못했어요.");
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
      setError(nextError instanceof Error ? nextError.message : "설정을 열지 못했어요.");
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
        <SurfaceCard style={styles.connectionCard}>
          <View style={styles.iconBadge}>
            <ShieldCheck size={24} color={colors.accent} />
          </View>
          <View style={styles.connectionCopy}>
            <Text style={styles.connectionTitle}>{connectionLabel}</Text>
            <Text style={styles.muted}>
              걸음 수와 이동 거리의 날짜별 합계만 저장하며 GPS 경로는 저장하지 않아요.
            </Text>
          </View>
        </SurfaceCard>

        {status === "available" && !connected ? (
          <AppButton loading={busy === "connect"} onPress={() => void connect()}>
            Health Connect 연결
          </AppButton>
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
            >
              연결 설정
            </AppButton>
          </View>
        ) : null}

        {status === "needs_update" ? (
          <AppButton loading={busy === "settings"} onPress={() => void openSettings()}>
            Health Connect 업데이트
          </AppButton>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.notice}>{message}</Text> : null}

        <View style={styles.summaryGrid}>
          <SummaryCard label="오늘" value={`${numberFormatter.format(today.steps)}걸음`} />
          <SummaryCard label="최근 7일" value={`${numberFormatter.format(totalSteps)}걸음`} />
          <SummaryCard label="하루 평균" value={`${numberFormatter.format(averageSteps)}걸음`} />
          <SummaryCard label="이동 거리" value={`${distanceFormatter.format(totalDistance / 1000)}km`} />
        </View>

        <SurfaceCard style={styles.chartCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>최근 7일</Text>
              <Text style={styles.muted}>날짜별 걸음 수</Text>
            </View>
            {loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Footprints size={22} color={colors.accent} />
            )}
          </View>

          <View style={styles.chartRows}>
            {days.map((row) => (
              <View key={row.day} style={styles.chartRow}>
                <Text style={styles.dayLabel}>{dayLabel(row.day, today.day)}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${Math.round((row.steps / maxSteps) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.stepLabel}>{numberFormatter.format(row.steps)}</Text>
              </View>
            ))}
          </View>
        </SurfaceCard>

        <SurfaceCard style={styles.privacyCard}>
          <View style={styles.privacyRow}>
            <RefreshCw size={20} color={colors.accent} />
            <Text style={styles.privacyText}>Android에서 동기화한 결과는 웹 걷기 페이지에도 표시돼요.</Text>
          </View>
          <View style={styles.privacyRow}>
            <Settings size={20} color={colors.accent} />
            <Text style={styles.privacyText}>권한은 Health Connect 설정에서 언제든 철회할 수 있어요.</Text>
          </View>
        </SurfaceCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <SurfaceCard style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </SurfaceCard>
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
  connectionCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconBadge: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentTintedBg,
  },
  connectionCopy: { flex: 1, gap: spacing.xxs },
  connectionTitle: { ...typography.section, color: colors.text },
  muted: { ...typography.label, color: colors.textMuted },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  flexButton: { flex: 1 },
  error: { ...typography.body, color: colors.danger },
  notice: { ...typography.body, color: colors.accentTintedText },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  summaryCard: { flexGrow: 1, flexBasis: "47%", minWidth: 140, gap: spacing.xs },
  summaryLabel: { ...typography.label, color: colors.textMuted },
  summaryValue: { ...typography.section, color: colors.text },
  chartCard: { gap: spacing.lg },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  sectionTitle: { ...typography.section, color: colors.text },
  chartRows: { gap: spacing.md },
  chartRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dayLabel: { ...typography.micro, color: colors.textMuted, width: 72 },
  barTrack: { flex: 1, height: 10, backgroundColor: colors.accentTintedBg, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.accent },
  stepLabel: { ...typography.micro, color: colors.text, width: 56, textAlign: "right" },
  privacyCard: { gap: spacing.md },
  privacyRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  privacyText: { ...typography.label, color: colors.textMuted, flex: 1 },
});
