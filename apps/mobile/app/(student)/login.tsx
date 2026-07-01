import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  auth,
  colors,
  spacing,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError, getApiBase } from "../../lib/api";
import {
  loadSessionToken,
  saveSessionToken,
  saveStudentCache,
} from "../../lib/session";
import { AppButton, SurfaceCard, TextField } from "../../components/ui";
import type { StudentAuthResponse } from "../../lib/types";

// 학생 로그인 — 교사가 발급한 6자리 영문·숫자 코드로 로그인.
export default function StudentLogin() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

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
    if (trimmed.length !== auth.codeLength) {
      setError("6자리 코드를 입력해 주세요.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<StudentAuthResponse>("/api/student/auth", {
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
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <SurfaceCard style={styles.loginCard}>
          <Text style={styles.loginTitle}>학생 로그인</Text>

          <TextField
            style={styles.codeInput}
            value={code}
            onChangeText={(t) => {
              setCode(t.toUpperCase());
              if (error) setError(null);
            }}
            placeholder="코드 입력"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={auth.codeLength}
            textAlign="center"
            editable={!loading}
            onSubmitEditing={handleSubmit}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <AppButton
            onPress={handleSubmit}
            disabled={loading || code.trim().length === 0}
            loading={loading}
          >
            로그인
          </AppButton>
        </SurfaceCard>
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
  inner: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
  },
  loginCard: {
    width: "100%",
    maxWidth: auth.cardMaxWidth,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
    gap: spacing.lg,
  },
  loginTitle: {
    ...typography.display,
    color: colors.text,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  codeInput: {
    ...typography.title,
    color: colors.text,
    backgroundColor: colors.bgAlt,
    paddingVertical: spacing.lg,
    textAlign: "center",
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
  },
});
