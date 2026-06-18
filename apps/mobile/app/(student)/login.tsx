import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  auth,
  brand,
  colors,
  layout,
  iconSizes,
  radii,
  responsive,
  spacing,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError, getApiBase } from "../../lib/api";
import { webSafeWidthStyle } from "../../lib/responsive";
import {
  loadSessionToken,
  saveSessionToken,
  saveStudentCache,
} from "../../lib/session";
import { LogoLockup } from "../../components/LogoLockup";
import { AppButton, SurfaceCard, TextField } from "../../components/ui";
import type { StudentAuthResponse } from "../../lib/types";

// 학생 로그인 — 교사가 발급한 6자리 영문·숫자 코드로 로그인.
// QR 스캐너는 추후 phase (expo-camera + barcode scanner).
export default function StudentLogin() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const isNarrow = width < layout.authTwoPaneBreakpoint;
  const webNarrowPaneStyle = webSafeWidthStyle(width, {
    enabled: isNarrow,
    inset: responsive.authWebSafeInset,
  });

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
      <ScrollView contentContainerStyle={styles.inner}>
        <View style={styles.brandRow}>
          <LogoLockup
            size={brand.logoSize}
            wordmarkStyle={styles.brandTitle}
          />
          <Text style={styles.brandSub}>학생 로그인</Text>
        </View>

        <View
          style={[
            styles.twoPane,
            isNarrow && styles.twoPaneNarrow,
            webNarrowPaneStyle,
          ]}
        >
          {/* Left — QR scanner placeholder (expo-camera 후속) */}
          <SurfaceCard style={[styles.qrPane, isNarrow && styles.fullWidthPane]}>
            <View style={styles.qrFrame}>
              <View style={[styles.qrCorner, styles.qrCornerTL]} />
              <View style={[styles.qrCorner, styles.qrCornerTR]} />
              <View style={[styles.qrCorner, styles.qrCornerBL]} />
              <View style={[styles.qrCorner, styles.qrCornerBR]} />
              <Text style={styles.qrEmoji}>📷</Text>
              <Text style={styles.qrHint}>
                QR 스캔은 다음 업데이트에서{"\n"}제공됩니다. 지금은 오른쪽 코드를 입력해 주세요.
              </Text>
            </View>
          </SurfaceCard>

          {/* Right — 6-digit code */}
          <SurfaceCard style={[styles.codePane, isNarrow && styles.fullWidthPane]}>
            <Text style={styles.codeHeading}>코드로 입장</Text>
            <Text style={styles.codeSub}>
              선생님께 받은 6자리 영문·숫자 코드를 입력하세요.
            </Text>

            <TextField
              style={styles.codeInput}
              value={code}
              onChangeText={(t) => {
                setCode(t);
                if (error) setError(null);
              }}
              placeholder="ABC123"
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
              disabled={code.trim().length !== auth.codeLength}
              loading={loading}
            >
              들어가기 →
            </AppButton>

            <Text style={styles.codeHelp}>
              코드를 잃어버렸다면 선생님께 다시 요청하세요.
            </Text>
          </SurfaceCard>
        </View>
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
    padding: spacing.xxl,
    gap: spacing.xl,
    alignItems: "stretch",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
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
    alignSelf: "stretch",
  },

  qrPane: {
    flex: 1,
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  qrFrame: {
    width: "100%",
    maxWidth: auth.qrFrameMaxWidth,
    aspectRatio: 1,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceAlt,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  qrEmoji: { fontSize: iconSizes.hero, marginBottom: spacing.md },
  qrHint: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  qrCorner: {
    position: "absolute",
    width: auth.scanCornerSize,
    height: auth.scanCornerSize,
    borderColor: colors.accent,
  },
  qrCornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: auth.scanCornerBorderWidth,
    borderLeftWidth: auth.scanCornerBorderWidth,
    borderTopLeftRadius: radii.card,
  },
  qrCornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: auth.scanCornerBorderWidth,
    borderRightWidth: auth.scanCornerBorderWidth,
    borderTopRightRadius: radii.card,
  },
  qrCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: auth.scanCornerBorderWidth,
    borderLeftWidth: auth.scanCornerBorderWidth,
    borderBottomLeftRadius: radii.card,
  },
  qrCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: auth.scanCornerBorderWidth,
    borderRightWidth: auth.scanCornerBorderWidth,
    borderBottomRightRadius: radii.card,
  },

  codePane: {
    flex: 1,
    padding: spacing.xxl,
    justifyContent: "center",
    gap: spacing.lg,
  },
  fullWidthPane: {
    alignSelf: "stretch",
    flex: undefined,
  },
  codeHeading: { ...typography.title, color: colors.text },
  codeSub: { ...typography.body, color: colors.textMuted },
  codeInput: {
    ...typography.code,
    paddingVertical: spacing.lg,
    backgroundColor: colors.bg,
    marginTop: spacing.md,
  },
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
});
