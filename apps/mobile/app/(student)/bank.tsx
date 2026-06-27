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
  bank,
  colors,
  spacing,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { BankOverview } from "../../lib/types";
import { AppButton, AppHeader, SurfaceCard, SurfacePressable, TextField } from "../../components/ui";

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
          <View style={styles.summaryGrid}>
            <Summary label="총 예치금" value={`${data.totals.totalBalance.toLocaleString()} ${data.currency.unitLabel}`} />
            <Summary label="활성 적금" value={`${data.activeFDs.length}건`} />
          </View>

          <Text style={styles.sectionTitle}>학생 계좌</Text>
          <View style={styles.studentList}>
            {data.students.map((student) => {
              const selectedRow = student.id === selectedId;
              return (
                <SurfacePressable
                  key={student.id}
                  style={[styles.studentRow, selectedRow && styles.studentRowOn]}
                  onPress={() => setSelectedId(student.id)}
                >
                  <Text style={styles.studentNumber}>{student.number ?? "-"}</Text>
                  <Text style={styles.studentName}>{student.name}</Text>
                  <Text style={styles.studentBalance}>
                    {student.balance.toLocaleString()} {data.currency.unitLabel}
                  </Text>
                </SurfacePressable>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>처리</Text>
          <SurfaceCard style={styles.actionCard}>
            <Text style={styles.selectedText}>
              {selected ? `${selected.name} 학생 선택됨` : "학생을 선택하세요"}
            </Text>
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
          </SurfaceCard>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <SurfaceCard style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </SurfaceCard>
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
  content: { padding: spacing.xxl, gap: spacing.lg },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
  summaryGrid: { flexDirection: "row", gap: spacing.md },
  summaryCard: {
    flex: 1,
    padding: spacing.lg,
  },
  summaryLabel: { ...typography.micro, color: colors.textMuted },
  summaryValue: { ...typography.section, color: colors.text, marginTop: spacing.xs },
  sectionTitle: { ...typography.section, color: colors.text },
  studentList: { gap: spacing.sm },
  studentRow: {
    minHeight: bank.studentRowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  studentRowOn: { borderColor: colors.accent, backgroundColor: colors.accentTintedBg },
  studentNumber: { ...typography.label, color: colors.textMuted, width: bank.studentNumberWidth },
  studentName: { ...typography.section, color: colors.text, flex: 1 },
  studentBalance: { ...typography.label, color: colors.text },
  actionCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  selectedText: { ...typography.label, color: colors.accent },
  input: {
    minHeight: bank.inputMinHeight,
    backgroundColor: colors.bg,
  },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  actionBtn: {
    flex: 1,
    minHeight: bank.actionMinHeight,
  },
});
