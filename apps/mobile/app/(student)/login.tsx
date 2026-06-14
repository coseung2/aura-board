import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
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
import { apiFetch, ApiError, getApiBase } from "../../lib/api";
import {
  loadSessionToken,
  saveSessionToken,
  saveStudentCache,
} from "../../lib/session";
import { LogoLockup } from "../../components/LogoLockup";

type AuthResponse = {
  success: boolean;
  sessionToken: string;
  redirect: string;
  student: {
    id: string;
    name: string;
    classroomId: string;
  };
};

// 학생 로그인 — 교사가 발급한 6자리 영문·숫자 코드로 로그인.
// QR 스캐너는 추후 phase (expo-camera + barcode scanner).
export default function StudentLogin() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const isNarrow = width < 720;

  // 앱 시작 시 기존 토큰이 있으면 대시보드로 바로 이동.
  useEffect(() => {
    (async () => {
      try {
        const token = await loadSessionToken();
        if (!token) return;
        // 토큰이 유효한지 /api/student/me 로 한 번 확인.
        await apiFetch("/api/student/me");
        router.replace("/(student)");
      } catch {
        // 무효 토큰 → 로그인 화면 유지.
      } finally {
        setBooting(false);
      }
    })();
  }, [router]);

  async function handleSubmit() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError("6자리 코드를 입력해 주세요.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<AuthResponse>("/api/student/auth", {
        method: "POST",
        json: { token: trimmed },
        skipAuth: true,
      });
      if (!res.success || !res.sessionToken) {
        throw new Error("로그인에 실패했어요.");
      }
      await saveSessionToken(res.sessionToken);
      await saveStudentCache({
        id: res.student.id,
        name: res.student.name,
        classroomId: res.student.classroomId,
      });
      router.replace("/(student)");
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 404) setError("코드를 찾을 수 없어요. 선생님께 다시 받아주세요.");
        else if (e.status === 429) setError("너무 많이 시도했어요. 잠시 후 다시 시도해주세요.");
        else setError(`로그인 실패 (${e.status})`);
      } else {
        setError(
          `연결할 수 없어요. 인터넷을 확인해 주세요.\n(${getApiBase()})`,
        );
      }
    } finally {
      setLoading(false);
    }
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.bootingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.bootingText}>불러오는 중…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.inner}>
        <View style={styles.brandRow}>
          <LogoLockup
            size={36}
            wordmarkStyle={styles.brandTitle}
          />
          <Text style={styles.brandSub}>학생 로그인</Text>
        </View>

        <View style={[styles.twoPane, isNarrow && styles.twoPaneNarrow]}>
          {/* Left — QR scanner placeholder (expo-camera 후속) */}
          <View style={styles.qrPane}>
            <View style={styles.qrFrame}>
              <View style={styles.qrCornerTL} />
              <View style={styles.qrCornerTR} />
              <View style={styles.qrCornerBL} />
              <View style={styles.qrCornerBR} />
              <Text style={styles.qrEmoji}>📷</Text>
              <Text style={styles.qrHint}>
                QR 스캔은 다음 업데이트에서{"\n"}제공됩니다. 지금은 오른쪽 코드를 입력해 주세요.
              </Text>
            </View>
          </View>

          {/* Right — 6-digit code */}
          <View style={styles.codePane}>
            <Text style={styles.codeHeading}>코드로 입장</Text>
            <Text style={styles.codeSub}>
              선생님께 받은 6자리 영문·숫자 코드를 입력하세요.
            </Text>

            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={(t) => {
                setCode(t);
                if (error) setError(null);
              }}
              placeholder="ABC123"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              textAlign="center"
              editable={!loading}
              onSubmitEditing={handleSubmit}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                (code.trim().length !== 6 || loading) && styles.submitBtnDisabled,
                pressed && code.trim().length === 6 && !loading && styles.submitBtnPressed,
              ]}
              onPress={handleSubmit}
              disabled={code.trim().length !== 6 || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>들어가기 →</Text>
              )}
            </Pressable>

            <Text style={styles.codeHelp}>
              코드를 잃어버렸다면 선생님께 다시 요청하세요.
            </Text>
          </View>
        </View>

        <Text style={styles.baseUrlHint}>{getApiBase()}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  bootingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  bootingText: { ...typography.body, color: colors.textMuted },
  inner: { flexGrow: 1, padding: spacing.xxl, gap: spacing.xl },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  brandTitle: { ...typography.display, color: colors.text },
  brandSub: { ...typography.subtitle, color: colors.textMuted },
  twoPane: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.xl,
  },
  twoPaneNarrow: {
    flexDirection: "column",
  },

  qrPane: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    ...shadows.card,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  qrFrame: {
    width: "100%",
    maxWidth: 320,
    aspectRatio: 1,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  qrEmoji: { fontSize: 56, marginBottom: spacing.md },
  qrHint: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  qrCornerTL: {
    position: "absolute",
    top: 0, left: 0, width: 32, height: 32,
    borderTopWidth: 3, borderLeftWidth: 3,
    borderColor: colors.accent,
    borderTopLeftRadius: radii.card,
  },
  qrCornerTR: {
    position: "absolute",
    top: 0, right: 0, width: 32, height: 32,
    borderTopWidth: 3, borderRightWidth: 3,
    borderColor: colors.accent,
    borderTopRightRadius: radii.card,
  },
  qrCornerBL: {
    position: "absolute",
    bottom: 0, left: 0, width: 32, height: 32,
    borderBottomWidth: 3, borderLeftWidth: 3,
    borderColor: colors.accent,
    borderBottomLeftRadius: radii.card,
  },
  qrCornerBR: {
    position: "absolute",
    bottom: 0, right: 0, width: 32, height: 32,
    borderBottomWidth: 3, borderRightWidth: 3,
    borderColor: colors.accent,
    borderBottomRightRadius: radii.card,
  },

  codePane: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    ...shadows.card,
    padding: spacing.xxl,
    justifyContent: "center",
    gap: spacing.lg,
  },
  codeHeading: { ...typography.title, color: colors.text },
  codeSub: { ...typography.body, color: colors.textMuted },
  codeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    paddingVertical: spacing.lg,
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: 8,
    color: colors.text,
    backgroundColor: colors.bg,
    marginTop: spacing.md,
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
  codeHelp: {
    ...typography.micro,
    color: colors.textFaint,
    textAlign: "center",
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  baseUrlHint: {
    ...typography.micro,
    color: colors.textFaint,
    textAlign: "center",
  },
});
