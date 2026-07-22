import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch, ApiError } from "../../lib/api";
import { clearSessionToken, getUnifiedLoginRoute } from "../../lib/session";
import { colors, spacing, studentNav, typography } from "../../theme/tokens";
import { AppButton, AppHeader, SurfaceCard } from "../../components/ui";

type PairCodePayload = { code: string; expiresAt: string };

export default function StudentCanvaScreen() {
  const router = useRouter();
  const [payload, setPayload] = useState<PairCodePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const issue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayload(await apiFetch<PairCodePayload>("/api/student/canva-pair", { method: "POST" }));
    } catch (nextError) {
      if (nextError instanceof ApiError && nextError.status === 401) {
        await clearSessionToken();
        router.replace(getUnifiedLoginRoute("student"));
        return;
      }
      setError("연결 코드를 만들지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void issue();
  }, [issue]);

  const prettyCode = payload
    ? `${payload.code.slice(0, 4)}-${payload.code.slice(4)}`
    : "";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AppHeader title="Canva 연결" onBack={() => router.back()} />
      <View style={styles.content}>
        <SurfaceCard style={styles.card}>
          <Text style={styles.eyebrow}>5분간 유효 · 한 번만 사용</Text>
          <Text style={styles.title}>Canva 앱에 아래 연결 코드를 입력하세요</Text>
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <Text selectable style={styles.code}>{prettyCode}</Text>
          )}
          <Text style={styles.help}>
            Canva 앱의 연결 코드 칸에 8자를 입력하세요. 대시는 생략해도 됩니다.
          </Text>
          <AppButton variant="secondary" loading={loading} onPress={() => void issue()}>
            새 코드 만들기
          </AppButton>
        </SurfaceCard>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { width: "100%", maxWidth: studentNav.canvaCardMaxWidth, alignItems: "center", gap: spacing.lg, padding: spacing.xxl },
  eyebrow: { ...typography.micro, color: colors.textMuted },
  title: { ...typography.title, color: colors.text, textAlign: "center" },
  code: { ...typography.display, color: colors.text, textAlign: "center" },
  help: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  error: { ...typography.body, color: colors.danger },
});
