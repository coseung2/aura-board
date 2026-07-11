import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import Svg, { Circle, Line, Path } from "react-native-svg";
import {
  brand,
  borders,
  colors,
  iconSizes,
  layout,
  radii,
  responsive,
  spacing,
  states,
  tapMin,
  typography,
  auth,
} from "../theme/tokens";
import {
  clearParentSession,
  loadSessionToken,
  loadParentToken,
  saveParentCache,
  saveSessionToken,
  saveStudentCache,
} from "../lib/session";
import { apiFetch, ApiError, getApiBase } from "../lib/api";
import { webSafeWidthStyle } from "../lib/responsive";
import { LogoLockup } from "../components/LogoLockup";
import {
  ControlPressable,
  SurfaceCard,
  TextField,
} from "../components/ui";
import type { ParentChildrenResponse, StudentAuthResponse } from "../lib/types";

// 랜딩 화면 — 학생 / 학부모 역할 선택.
// 기존 세션이 있으면 해당 역할 대시보드로 자동 이동.

type ParentOAuthProvider = "google" | "kakao";

export default function Landing() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [booting, setBooting] = useState(true);
  const [studentCode, setStudentCode] = useState("");
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);
  const isNarrow = width < layout.mobileBreakpoint;
  const webNarrowContentStyle = webSafeWidthStyle(width, {
    enabled: isNarrow,
    inset: responsive.roleWebSafeInset,
    maxWidth: layout.roleCardNarrowMaxWidth,
  });

  useEffect(() => {
    (async () => {
      try {
        // 기존 학생 세션 확인
        const studentToken = await loadSessionToken();
        if (studentToken) {
          await apiFetch("/api/student/me");
          router.replace("/(student)");
          return;
        }
      } catch {
        // 학생 세션 무효
      }

      try {
        const parentToken = await loadParentToken();
        if (parentToken) {
          const res = await apiFetch<ParentChildrenResponse>(
            "/api/parent/children",
            { parentAuth: true },
          );
          void saveParentCache({
            id: res.parent.id,
            name: res.parent.name || "학부모",
            email: res.parent.email,
            linkedStudentIds: res.children.map((child) => child.studentId),
          });
          router.replace("/(parent)");
          return;
        }
      } catch {
        await clearParentSession();
      }

      setBooting(false);
    })();
  }, [router]);

  async function handleStudentLogin() {
    const trimmed = studentCode.trim().toUpperCase();
    if (trimmed.length !== auth.codeLength) {
      setStudentError("6자리 코드를 입력해 주세요.");
      return;
    }

    setStudentError(null);
    setStudentLoading(true);
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
        if (e.status === 404) {
          setStudentError("코드를 찾을 수 없어요.");
        } else if (e.status === 429) {
          setStudentError("잠시 후 다시 시도해 주세요.");
        } else {
          setStudentError(`로그인 실패 (${e.status})`);
        }
      } else {
        setStudentError(`연결할 수 없어요. (${getApiBase()})`);
      }
    } finally {
      setStudentLoading(false);
    }
  }

  async function handleParentOAuth(provider: ParentOAuthProvider) {
    const url = new URL(`/api/parent/auth/${provider}`, getApiBase());
    if (Platform.OS !== "web") {
      url.searchParams.set("client", "mobile");
    }
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      typeof window.location?.assign === "function"
    ) {
      window.location.assign(url.toString());
      return;
    }
    await Linking.openURL(url.toString());
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
        <View style={styles.brandRow}>
          <LogoLockup size={brand.logoSize} wordmarkStyle={styles.brandTitle} />
        </View>

        <View
          style={[
            styles.cardRow,
            isNarrow && styles.cardRowNarrow,
            webNarrowContentStyle,
          ]}
        >
          <SurfaceCard
            style={[styles.roleCard, isNarrow && styles.roleCardNarrow]}
          >
            <RoleLineIcon role="student" />
            <Text style={styles.roleTitle}>학생</Text>
            <Text style={styles.roleDesc}>
              QR/코드로 학급에 참여해요
            </Text>
            <View style={styles.studentLoginForm}>
              <TextField
                style={styles.studentCodeInput}
                value={studentCode}
                onChangeText={(text) => {
                  setStudentCode(text.toUpperCase());
                  if (studentError) setStudentError(null);
                }}
                placeholder="코드 입력"
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                maxLength={auth.codeLength}
                textAlign="center"
                editable={!studentLoading}
                onSubmitEditing={handleStudentLogin}
              />
              {studentError ? (
                <Text style={styles.studentErrorText}>{studentError}</Text>
              ) : null}
              <ControlPressable
                style={[
                  styles.studentLoginButton,
                  (studentLoading || studentCode.trim().length === 0) &&
                    styles.studentLoginButtonDisabled,
                ]}
                onPress={handleStudentLogin}
                disabled={studentLoading || studentCode.trim().length === 0}
              >
                <Text style={styles.studentLoginButtonText}>
                  {studentLoading ? "확인 중..." : "학생 로그인"}
                </Text>
              </ControlPressable>
            </View>
          </SurfaceCard>

          <SurfaceCard
            style={[styles.roleCard, isNarrow && styles.roleCardNarrow]}
          >
            <RoleLineIcon role="parent" />
            <Text style={styles.roleTitle}>학부모</Text>
            <Text style={styles.roleDesc}>
              자녀 작품을 확인해요
            </Text>
            <View style={styles.oauthActions}>
              <ControlPressable
                style={styles.oauthGoogle}
                onPress={() => handleParentOAuth("google")}
                accessibilityLabel="Google로 로그인"
              >
                <GoogleGlyph />
                <Text style={styles.oauthGoogleText}>Google로 로그인</Text>
              </ControlPressable>
              <ControlPressable
                style={styles.oauthKakao}
                onPress={() => handleParentOAuth("kakao")}
                accessibilityLabel="Kakao로 로그인"
              >
                <KakaoGlyph />
                <Text style={styles.oauthKakaoText}>Kakao로 로그인</Text>
              </ControlPressable>
              {__DEV__ ? (
                <ControlPressable
                  style={styles.devPreviewButton}
                  onPress={() => router.push("/(parent)/dev-preview")}
                  accessibilityLabel="개발용 학부모 피드 미리보기 열기"
                >
                  <Text style={styles.devPreviewButtonText}>
                    개발용 미리보기
                  </Text>
                </ControlPressable>
              ) : null}
            </View>
          </SurfaceCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function RoleLineIcon({ role }: { role: "student" | "parent" }) {
  const common = {
    width: iconSizes.hero,
    height: iconSizes.hero,
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: colors.text,
    strokeWidth: borders.medium,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (role === "student") {
    return (
      <Svg {...common} accessibilityLabel="학생">
        <Path d="M8 10 C14 10 20 11 24 14 C28 11 34 10 40 10 L40 36 C34 36 28 37 24 40 C20 37 14 36 8 36 Z" />
        <Line x1="24" y1="14" x2="24" y2="40" />
        <Path d="M30 10 L30 20 L33 17 L36 20 L36 10" />
      </Svg>
    );
  }

  return (
    <Svg {...common} accessibilityLabel="학부모">
      <Path d="M8 22 L24 8 L40 22" />
      <Circle cx="18" cy="28" r="3.5" />
      <Path d="M14 42 L14 34 a4 4 0 0 1 8 0 L22 42" />
      <Circle cx="32" cy="30" r="2.5" />
      <Path d="M29 42 L29 36 a3 3 0 0 1 6 0 L35 42" />
      <Line x1="22" y1="36" x2="29" y2="36" />
    </Svg>
  );
}

function GoogleGlyph() {
  return (
    <Svg
      width={iconSizes.md}
      height={iconSizes.md}
      viewBox="0 0 24 24"
      accessibilityLabel="Google"
    >
      <Path
        fill={colors.oauthGoogle}
        d="M21.6 12.227c0-.708-.064-1.39-.182-2.045H12v3.868h5.385a4.604 4.604 0 0 1-1.997 3.022v2.51h3.231c1.891-1.741 2.981-4.307 2.981-7.355z"
      />
      <Path
        fill={colors.plantActive}
        d="M12 22c2.7 0 4.964-.895 6.619-2.418l-3.231-2.51c-.895.6-2.04.954-3.388.954-2.605 0-4.81-1.76-5.598-4.123H3.064v2.59A9.996 9.996 0 0 0 12 22z"
      />
      <Path
        fill={colors.warning}
        d="M6.402 13.903a6.005 6.005 0 0 1 0-3.806v-2.59H3.064a9.998 9.998 0 0 0 0 8.987l3.338-2.59z"
      />
      <Path
        fill={colors.danger}
        d="M12 5.977c1.469 0 2.786.505 3.823 1.495l2.866-2.866C16.96 2.99 14.696 2 12 2A9.998 9.998 0 0 0 3.064 7.508l3.338 2.59C7.19 7.736 9.395 5.977 12 5.977z"
      />
    </Svg>
  );
}

function KakaoGlyph() {
  return (
    <Svg
      width={iconSizes.md}
      height={iconSizes.md}
      viewBox="0 0 24 24"
      accessibilityLabel="Kakao"
    >
      <Path
        fill={colors.text}
        d="M12 4C7.03 4 3 7.21 3 11.16c0 2.6 1.74 4.87 4.34 6.13l-.83 3.06c-.07.27.22.49.46.34l3.62-2.4c.46.05.93.07 1.41.07 4.97 0 9-3.21 9-7.2C21 7.21 16.97 4 12 4z"
      />
    </Svg>
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
    gap: spacing.lg,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  brandTitle: { ...typography.display, color: colors.text },
  cardRow: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  cardRowNarrow: {
    flexDirection: "column",
    width: "100%",
    maxWidth: layout.roleCardNarrowMaxWidth,
  },
  roleCard: {
    width: layout.roleCardWidth,
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
  },
  roleCardNarrow: {
    width: "100%",
  },
  roleTitle: { ...typography.title, color: colors.text },
  roleDesc: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  studentLoginForm: {
    width: "100%",
    gap: spacing.sm,
    alignItems: "center",
  },
  studentCodeInput: {
    width: "100%",
    height: tapMin,
    backgroundColor: colors.surface,
    textAlign: "center",
    ...typography.subtitle,
  },
  studentErrorText: {
    ...typography.micro,
    color: colors.danger,
    textAlign: "center",
  },
  studentLoginButton: {
    width: "100%",
    height: tapMin,
    borderRadius: radii.btn,
    borderColor: colors.accent,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  studentLoginButtonDisabled: {
    opacity: states.disabledOpacity,
  },
  studentLoginButtonText: {
    ...typography.label,
    color: colors.onAccent,
  },
  oauthActions: {
    width: "100%",
    gap: spacing.sm,
  },
  oauthGoogle: {
    width: "100%",
    height: tapMin,
    borderRadius: radii.btn,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  oauthKakao: {
    width: "100%",
    height: tapMin,
    borderRadius: radii.btn,
    borderColor: colors.oauthKakao,
    backgroundColor: colors.oauthKakao,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  oauthGoogleText: {
    ...typography.label,
    color: colors.text,
  },
  oauthKakaoText: {
    ...typography.label,
    color: colors.text,
  },
  devPreviewButton: {
    width: "100%",
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    borderColor: colors.transparent,
  },
  devPreviewButtonText: {
    ...typography.label,
    color: colors.accent,
  },
});
