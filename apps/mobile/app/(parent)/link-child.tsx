import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  radii,
  shadows,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { ApiError, parentApiFetch } from "../../lib/api";
import { clearParentSession } from "../../lib/session";
import type {
  ParentMatchCodeRequest,
  ParentMatchCodeResponse,
  ParentMatchRequest,
  ParentMatchRequestResponse,
  ParentMatchStudent,
  ParentMatchStudentsResponse,
} from "../../lib/types";

export default function LinkChildScreen() {
  const router = useRouter();

  const [step, setStep] = useState<"code" | "roster" | "done">("code");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const [classroomName, setClassroomName] = useState("");
  const [students, setStudents] = useState<ParentMatchStudent[]>([]);
  const [result, setResult] = useState<ParentMatchRequestResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuthError = useCallback(async () => {
    await clearParentSession();
    router.replace(
      "/(parent)/login?error=로그인이 만료되었어요. 다시 로그인해 주세요.",
    );
  }, [router]);

  function mapMatchError(body: unknown): string | null {
    const b = body as Record<string, unknown> | null;
    if (!b) return null;
    const code = b.code ?? b.error;
    if (typeof code === "string") {
      switch (code) {
        case "code_not_found":
          return "등록된 연결 코드가 없어요. 코드를 다시 확인해 주세요.";
        case "code_expired":
          return "연결 코드가 만료되었어요. 새 코드를 받아 주세요.";
        case "rate_limited":
          return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
      }
    }
    if (typeof b.message === "string" && b.message) {
      return b.message;
    }
    return null;
  }

  function statusLabel(status: string): string {
    switch (status) {
      case "pending":
        return "승인 대기 중";
      case "approved":
      case "linked":
        return "연결 완료";
      case "rejected":
        return "연결 거절됨";
      default:
        return status;
    }
  }

  async function handleVerifyCode() {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("코드를 입력해 주세요.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await parentApiFetch<ParentMatchCodeResponse>(
        "/api/parent/match/code",
        {
          method: "POST",
          json: { code: trimmed } satisfies ParentMatchCodeRequest,
        },
      );
      setTicket(res.ticket);
      setClassroomName(res.classroomName);

      const roster = await parentApiFetch<ParentMatchStudentsResponse>(
        `/api/parent/match/students?ticket=${encodeURIComponent(res.ticket)}`,
      );
      setClassroomName(roster.classroomName);
      setStudents(roster.students);
      setStep("roster");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await handleAuthError();
        return;
      }
      if (e instanceof ApiError) {
        const msg = mapMatchError(e.body) ?? "코드를 확인하지 못했어요.";
        setError(msg);
      } else {
        setError("네트워크 오류가 발생했어요. 다시 시도해 주세요.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectStudent(student: ParentMatchStudent) {
    if (!ticket) return;
    setError(null);
    setLoading(true);

    try {
      const res = await parentApiFetch<ParentMatchRequestResponse>(
        "/api/parent/match/request",
        {
          method: "POST",
          json: { ticket, studentId: student.id } satisfies ParentMatchRequest,
        },
      );
      setResult(res);
      setStep("done");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await handleAuthError();
        return;
      }
      if (e instanceof ApiError) {
        const msg = mapMatchError(e.body) ?? "자녀 연결 요청에 실패했어요.";
        setError(msg);
      } else {
        setError("네트워크 오류가 발생했어요. 다시 시도해 주세요.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleGoHome() {
    router.replace("/(parent)");
  }

  function handleLinkAnother() {
    setStep("code");
    setCode("");
    setTicket(null);
    setClassroomName("");
    setStudents([]);
    setResult(null);
    setError(null);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={handleGoHome}
        >
          <Text style={styles.backText}>← 대시보드</Text>
        </Pressable>
        <Text style={styles.headerTitle}>자녀 연결</Text>
        <View style={styles.backBtn} />
      </View>

      {step === "code" && (
        <View style={styles.inner}>
          <View style={styles.card}>
            <Text style={styles.heading}>연결 코드 입력</Text>
            <Text style={styles.sub}>
              학급에서 안내받은 자녀 연결 코드를 입력하면 학생 명단을 확인할 수
              있어요.
            </Text>

            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(t) => {
                setCode(t);
                if (error) setError(null);
              }}
              placeholder="예: ABC123"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              onSubmitEditing={handleVerifyCode}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                (!code.trim() || loading) && styles.submitBtnDisabled,
                pressed && code.trim() && !loading && styles.submitBtnPressed,
              ]}
              onPress={handleVerifyCode}
              disabled={!code.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>코드 확인</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {step === "roster" && (
        <View style={styles.rosterWrap}>
          <View style={styles.rosterHeader}>
            <Text style={styles.heading}>{classroomName}</Text>
            <Text style={styles.sub}>연결할 자녀를 선택해 주세요.</Text>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          ) : null}

          <FlatList
            data={students}
            keyExtractor={(s) => s.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.studentCard,
                  pressed && styles.studentCardPressed,
                ]}
                onPress={() => handleSelectStudent(item)}
                disabled={loading}
              >
                <View style={styles.studentAvatar}>
                  <Text style={styles.studentEmoji}>🧒</Text>
                </View>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>{item.name}</Text>
                  <Text style={styles.studentMeta}>
                    {item.studentNo}번
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>📝</Text>
                <Text style={styles.emptyTitle}>학생 명단이 비어있어요</Text>
                <Text style={styles.emptyMsg}>
                  코드가 올바른지 확인해 주세요.
                </Text>
              </View>
            }
          />

          {loading ? (
            <View style={styles.rosterOverlay}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : null}
        </View>
      )}

      {step === "done" && (
        <View style={styles.inner}>
          <View style={styles.doneCard}>
            <Text style={styles.doneEmoji}>
              {result?.status === "approved" || result?.status === "linked"
                ? "🎉"
                : "📤"}
            </Text>
            <Text style={styles.heading}>
              {result?.status === "approved" || result?.status === "linked"
                ? "자녀 연결이 완료되었어요"
                : "연결 요청이 전송되었어요"}
            </Text>
            {result ? (
              <Text style={styles.sub}>
                상태: {statusLabel(result.status)}
                {"\n"}
                담임 선생님이 승인하면 자녀 활동을 확인할 수 있어요.
              </Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && styles.submitBtnPressed,
              ]}
              onPress={handleGoHome}
            >
              <Text style={styles.submitText}>대시보드로 가기</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.textBtn,
                pressed && styles.textBtnPressed,
              ]}
              onPress={handleLinkAnother}
            >
              <Text style={styles.textBtnText}>다른 자녀 연결하기</Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  backBtn: {
    minWidth: 80,
    paddingVertical: spacing.sm,
  },
  backBtnPressed: { opacity: 0.6 },
  backText: { ...typography.label, color: colors.textMuted },
  headerTitle: { ...typography.subtitle, color: colors.text },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  card: {
    width: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xxl,
    gap: spacing.lg,
    ...shadows.card,
  },
  heading: { ...typography.title, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    fontSize: 18,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  submitBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    paddingVertical: spacing.lg,
    alignItems: "center",
    minHeight: tapMin,
    ...shadows.accent,
  },
  submitBtnDisabled: {
    backgroundColor: colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnPressed: { backgroundColor: colors.accentActive },
  submitText: { ...typography.subtitle, color: "#fff" },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
  rosterWrap: { flex: 1 },
  rosterHeader: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  errorBanner: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.statusReturnedBg,
  },
  errorBannerText: {
    ...typography.body,
    color: colors.statusReturnedText,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  studentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadows.card,
  },
  studentCardPressed: { backgroundColor: colors.surfaceAlt },
  studentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentTintedBg,
    alignItems: "center",
    justifyContent: "center",
  },
  studentEmoji: { fontSize: 24 },
  studentInfo: { flex: 1, gap: spacing.xs },
  studentName: { ...typography.subtitle, color: colors.text },
  studentMeta: { ...typography.body, color: colors.textMuted },
  chevron: {
    fontSize: 28,
    color: colors.textFaint,
    fontWeight: "300",
  },
  emptyWrap: {
    alignItems: "center",
    paddingTop: spacing.xxxl,
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyMsg: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  rosterOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(246, 245, 244, 0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  doneCard: {
    width: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xxl,
    gap: spacing.lg,
    alignItems: "center",
    ...shadows.card,
  },
  doneEmoji: { fontSize: 56 },
  textBtn: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  textBtnPressed: { opacity: 0.6 },
  textBtnText: { ...typography.label, color: colors.textMuted },
});
