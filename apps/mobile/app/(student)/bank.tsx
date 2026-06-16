import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  radii,
  shadows,
  spacing,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken } from "../../lib/session";
import type { BankOverview } from "../../lib/types";

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
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>학급 은행</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.muted}>계좌 목록을 불러오는 중이에요.</Text>
        </View>
      ) : error && !data ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.primaryBtn} onPress={load}>
            <Text style={styles.primaryText}>다시 시도</Text>
          </Pressable>
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
                <Pressable
                  key={student.id}
                  style={[styles.studentRow, selectedRow && styles.studentRowOn]}
                  onPress={() => setSelectedId(student.id)}
                >
                  <Text style={styles.studentNumber}>{student.number ?? "-"}</Text>
                  <Text style={styles.studentName}>{student.name}</Text>
                  <Text style={styles.studentBalance}>
                    {student.balance.toLocaleString()} {data.currency.unitLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>처리</Text>
          <View style={styles.actionCard}>
            <Text style={styles.selectedText}>
              {selected ? `${selected.name} 학생 선택됨` : "학생을 선택하세요"}
            </Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={(value) => setAmount(value.replace(/[^\d,]/g, ""))}
              keyboardType="number-pad"
              placeholder="금액"
              placeholderTextColor={colors.textFaint}
              editable={!busy}
            />
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="사유 (선택)"
              placeholderTextColor={colors.textFaint}
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

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
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
    <Pressable
      style={({ pressed }) => [
        styles.actionBtn,
        disabled && styles.actionBtnDisabled,
        pressed && !disabled && styles.actionBtnPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.actionBtnText}>{label}</Text>
    </Pressable>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  backText: { fontSize: 24, color: colors.text },
  title: { ...typography.title, color: colors.text },
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
  primaryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.accent,
    ...shadows.accent,
  },
  primaryText: { ...typography.label, color: "#fff" },
  summaryGrid: { flexDirection: "row", gap: spacing.md },
  summaryCard: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  summaryLabel: { ...typography.micro, color: colors.textMuted },
  summaryValue: { ...typography.section, color: colors.text, marginTop: spacing.xs },
  sectionTitle: { ...typography.section, color: colors.text },
  studentList: { gap: spacing.sm },
  studentRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  studentRowOn: { borderColor: colors.accent, backgroundColor: colors.accentTintedBg },
  studentNumber: { ...typography.label, color: colors.textMuted, width: 36 },
  studentName: { ...typography.section, color: colors.text, flex: 1 },
  studentBalance: { ...typography.label, color: colors.text },
  actionCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  selectedText: { ...typography.label, color: colors.accent },
  input: {
    minHeight: 48,
    borderRadius: radii.btn,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  actionBtn: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.btn,
    backgroundColor: colors.accent,
  },
  actionBtnPressed: { backgroundColor: colors.accentActive },
  actionBtnDisabled: { backgroundColor: colors.textFaint },
  actionBtnText: { ...typography.label, color: "#fff" },
});
