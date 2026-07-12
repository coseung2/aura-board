import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  borders,
  bank,
  colors,
  radii,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { BankOverview } from "../../lib/types";
import {
  AppButton,
  AppHeader,
  ControlPressable,
  SectionHeader,
  TextField,
} from "../../components/ui";

type ActionKind = "deposit" | "withdraw" | "fd_open";

export default function StudentBankScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ classroomId?: string | string[] }>();
  const classroomId = firstParam(params.classroomId);
  const [data, setData] = useState<BankOverview | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuthError = useCallback(
    async (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        await clearSessionToken();
        router.replace("/(student)/login");
        return true;
      }
      return false;
    },
    [router],
  );

  const load = useCallback(async () => {
    if (!classroomId) {
      setError("학급 정보를 찾을 수 없어요.");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await apiFetch<BankOverview>(
        `/api/classrooms/${encodeURIComponent(classroomId)}/bank/overview`,
      );
      setData(res);
      setSelectedId((current) => current ?? res.students[0]?.id ?? null);
      setError(null);
    } catch (e) {
      if (await handleAuthError(e)) return;
      if (e instanceof ApiError && e.status === 403) {
        setError("은행원 권한이 필요해요.");
      } else {
        setError("계좌 목록을 불러올 수 없어요.");
      }
    } finally {
      setLoading(false);
    }
  }, [classroomId, handleAuthError]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => data?.students.find((student) => student.id === selectedId) ?? null,
    [data, selectedId],
  );

  async function runAction(kind: ActionKind) {
    if (!classroomId || !selected) return;
    const n = Number(amount.replace(/,/g, ""));
    if (!Number.isInteger(n) || n <= 0) {
      setError("금액은 1 이상 정수로 입력해 주세요.");
      return;
    }

    const path =
      kind === "deposit"
        ? "deposit"
        : kind === "withdraw"
          ? "withdraw"
          : "fixed-deposits";
    const body =
      kind === "fd_open"
        ? { studentId: selected.id, principal: n }
        : { studentId: selected.id, amount: n, note: note.trim() || undefined };

    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/classrooms/${encodeURIComponent(classroomId)}/bank/${path}`, {
        method: "POST",
        json: body,
      });
      setAmount("");
      setNote("");
      await load();
      Alert.alert(
        "처리 완료",
        kind === "deposit" ? "입금했어요." : kind === "withdraw" ? "출금했어요." : "적금에 가입했어요.",
      );
    } catch (e) {
      if (await handleAuthError(e)) return;
      const body = e instanceof ApiError ? (e.body as { error?: string } | string) : null;
      setError(
        typeof body === "object" && body?.error
          ? body.error
          : typeof body === "string"
            ? body
            : "처리에 실패했어요.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="학급 은행" onBack={() => router.back()} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.muted}>계좌 목록을 불러오는 중이에요.</Text>
        </View>
      ) : error && !data ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <AppButton onPress={load}>다시 시도</AppButton>
        </View>
      ) : data ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.metricsSection}>
            <SectionHeader title="은행 현황" />
            <View style={styles.metricsList}>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>총 예치금</Text>
                <Text style={styles.metricValue}>
                  {data.totals.totalBalance.toLocaleString()} {data.currency.unitLabel}
                </Text>
              </View>
              <View style={[styles.metricRow, styles.metricRowLast]}>
                <Text style={styles.metricLabel}>활성 적금</Text>
                <Text style={styles.metricValue}>{data.activeFDs.length}건</Text>
              </View>
            </View>
          </View>

          <SectionHeader title="학생 계좌" />
          <View style={styles.studentList} accessibilityRole="list">
            {data.students.map((student) => {
              const selectedRow = student.id === selectedId;
              return (
                <ControlPressable
                  key={student.id}
                  style={[styles.studentRow, selectedRow && styles.studentRowOn]}
                  onPress={() => setSelectedId(student.id)}
                  accessibilityState={{ selected: selectedRow }}
                >
                  <View style={styles.studentIndicatorSlot} accessibilityElementsHidden>
                    {selectedRow ? (
                      <Text style={styles.studentIndicator} accessible={false}>
                        ✓
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.studentNumber}>{student.number ?? "-"}</Text>
                  <Text style={[styles.studentName, selectedRow && styles.studentNameOn]}>
                    {student.name}
                  </Text>
                  <Text style={styles.studentBalance}>
                    {student.balance.toLocaleString()} {data.currency.unitLabel}
                  </Text>
                </ControlPressable>
              );
            })}
          </View>

          <SectionHeader title="처리" />
          <View style={styles.actionSection}>
            <View style={styles.selectedRow}>
              <View style={styles.selectedIndicatorSlot} accessibilityElementsHidden>
                {selected ? (
                  <Text style={styles.selectedIndicator} accessible={false}>
                    ✓
                  </Text>
                ) : null}
              </View>
              <Text style={styles.selectedText} numberOfLines={2}>
                {selected ? `${selected.name} 학생 선택됨` : "학생을 선택하세요"}
              </Text>
            </View>
            <TextField
              style={styles.input}
              value={amount}
              onChangeText={(value) => setAmount(value.replace(/[^\d,]/g, ""))}
              keyboardType="number-pad"
              placeholder="금액"
              editable={!busy}
            />
            <TextField
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="사유 (선택)"
              editable={!busy}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actionRow}>
              <ActionButton label="입금" disabled={busy || !selected} onPress={() => runAction("deposit")} />
              <ActionButton label="출금" disabled={busy || !selected} onPress={() => runAction("withdraw")} />
              <ActionButton
                label="적금"
                disabled={busy || !selected || data.currency.monthlyInterestRate === null}
                onPress={() => runAction("fd_open")}
              />
            </View>
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function ActionButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <AppButton
      style={styles.actionBtn}
      onPress={onPress}
      disabled={disabled}
    >
      {label}
    </AppButton>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
  metricsSection: {
    gap: spacing.none,
  },
  metricsList: {
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  metricRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  metricRowLast: {
    borderBottomWidth: borders.none,
  },
  metricLabel: { ...typography.body, color: colors.textMuted },
  metricValue: {
    ...typography.section,
    color: colors.text,
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  studentList: {
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  studentRow: {
    minHeight: bank.studentRowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.none,
    borderWidth: borders.none,
    borderRadius: radii.none,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.transparent,
  },
  studentRowOn: {
    borderLeftWidth: borders.medium,
    borderLeftColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  studentIndicatorSlot: {
    width: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  studentIndicator: {
    ...typography.label,
    color: colors.accentTintedText,
    fontWeight: "700",
  },
  studentNumber: {
    ...typography.label,
    color: colors.textMuted,
    width: bank.studentNumberWidth,
    flexShrink: 0,
  },
  studentName: {
    ...typography.section,
    color: colors.text,
    flex: 1,
    minWidth: 0,
  },
  studentNameOn: {
    color: colors.accentTintedText,
    fontWeight: "700",
  },
  studentBalance: {
    ...typography.label,
    color: colors.text,
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  actionSection: {
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  selectedRow: {
    minHeight: tapMin,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  selectedIndicatorSlot: {
    width: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedIndicator: {
    ...typography.label,
    color: colors.accentTintedText,
    fontWeight: "700",
  },
  selectedText: {
    ...typography.label,
    color: colors.accentTintedText,
    fontWeight: "700",
    flex: 1,
    minWidth: 0,
  },
  input: {
    minHeight: bank.inputMinHeight,
    backgroundColor: colors.surface,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionBtn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 108,
    minWidth: 108,
    minHeight: bank.actionMinHeight,
  },
});
