import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import Svg, { Path } from "react-native-svg";
import { BookOpen, House } from "lucide-react-native";
import {
  brand,
  colors,
  iconSizes,
  layout,
  radii,
  responsive,
  spacing,
  tapMin,
  typography,
  auth,
} from "../theme/tokens";
import {
  clearParentSession,
  loadSessionToken,
  loadParentToken,
  saveParentCache,
  saveParentToken,
  saveSessionToken,
  saveStudentCache,
} from "../lib/session";
import { apiFetch, ApiError, getApiBase } from "../lib/api";
import { webSafeWidthStyle } from "../lib/responsive";
import { LogoLockup } from "../components/LogoLockup";
import {
  AppButton,
  ControlPressable,
  SemanticNav,
  SemanticNavItem,
  TextField,
} from "../components/ui";
import type { ParentChildrenResponse, StudentAuthResponse } from "../lib/types";

// 랜딩 화면 — 학생 / 학부모 역할 선택.
// 기존 세션이 있으면 해당 역할 대시보드로 자동 이동.

type ParentOAuthProvider = "google" | "kakao";

const PARENT_OAUTH_CALLBACK_PATH = "parent/auth/callback";

const PARENT_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  provider_disabled:
    "현재 OAuth 로그인이 비활성화되어 있어요. 관리자에게 문의해 주세요.",
  invalid_provider: "지원하지 않는 로그인 방식이에요.",
  invalid_state: "로그인 인증이 만료되었어요. 다시 시도해 주세요.",
  missing_params: "로그인 응답이 올바르지 않아요. 다시 시도해 주세요.",
  missing_pkce: "보안 정보가 누락되었어요. 다시 시도해 주세요.",
  token_exchange_failed:
    "로그인 토큰 교환에 실패했어요. 잠시 후 다시 시도해 주세요.",
  userinfo_failed: "사용자 정보 조회에 실패했어요. 잠시 후 다시 시도해 주세요.",
  upsert_failed: "계정 생성에 실패했어요. 잠시 후 다시 시도해 주세요.",
};

function parentAuthErrorMessage(value: string | string[] | undefined): string | null {
  const initial = Array.isArray(value) ? value[0] : value;
  if (!initial) return null;
  return PARENT_OAUTH_ERROR_MESSAGES[initial] ?? initial;
}

export default function Landing() {
  const router = useRouter();
  const { role: routeRole, error: routeError } = useLocalSearchParams<{
    role?: string | string[];
    error?: string | string[];
  }>();
  const requestedRole: "student" | "parent" | "review" | null =
    (Array.isArray(routeRole) ? routeRole[0] : routeRole) === "parent"
      ? "parent"
      : (Array.isArray(routeRole) ? routeRole[0] : routeRole) === "review"
        ? "review"
        : (Array.isArray(routeRole) ? routeRole[0] : routeRole) === "student"
          ? "student"
          : null;
  const { width } = useWindowDimensions();
  const [booting, setBooting] = useState(true);
  const [studentCode, setStudentCode] = useState("");
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [parentLoading, setParentLoading] = useState(false);
  const [parentReviewCode, setParentReviewCode] = useState("");
  const [parentError, setParentError] = useState<string | null>(() =>
    parentAuthErrorMessage(routeError),
  );
  const [activeRole, setActiveRole] = useState<"student" | "parent" | "review">(
    requestedRole ?? "student",
  );
  const isNarrow = width < layout.mobileBreakpoint;
  const webNarrowContentStyle = webSafeWidthStyle(width, {
    enabled: isNarrow,
    inset: responsive.roleWebSafeInset,
    maxWidth: layout.roleCardNarrowMaxWidth,
  });

  useEffect(() => {
    if (requestedRole) {
      setActiveRole(requestedRole);
      setBooting(false);
      return;
    }

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
  }, [requestedRole, router]);

  useEffect(() => {
    if (requestedRole) setActiveRole(requestedRole);
    setParentError(parentAuthErrorMessage(routeError));
  }, [requestedRole, routeError]);

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
    const redirectUri = Linking.createURL(PARENT_OAUTH_CALLBACK_PATH);
    if (Platform.OS !== "web") {
      url.searchParams.set("client", "mobile");
      url.searchParams.set("returnUrl", redirectUri);
    }
    setParentError(null);
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      typeof window.location?.assign === "function"
    ) {
      window.location.assign(url.toString());
      return;
    }

    setParentLoading(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        url.toString(),
        redirectUri,
      );
      if (result.type === "success") {
        // WebBrowser returns the callback URL on both platforms. Persist the
        // token here before routing so platform-specific Linking delivery (or
        // the callback screen mounting first) cannot leave the spinner stuck.
        let token: string | null = null;
        try {
          const callback = new URL(result.url);
          token =
            callback.searchParams.get("token") ??
            new URLSearchParams(callback.hash.slice(1)).get("token");
        } catch {
          token = null;
        }
        if (!token) {
          setParentError("로그인 결과가 올바르지 않아요. 다시 시도해 주세요.");
          return;
        }
        await saveParentToken(token);
        router.replace("/(parent)");
      } else if (result.type === "cancel" || result.type === "dismiss") {
        setParentError("로그인을 취소했어요.");
      }
    } catch {
      const providerLabel = provider === "google" ? "Google" : "Kakao";
      setParentError(`${providerLabel} 로그인을 시작하지 못했어요.`);
    } finally {
      setParentLoading(false);
    }
  }

  async function handleParentReviewLogin() {
    const code = parentReviewCode.trim().toUpperCase();
    if (code.length !== auth.codeLength) {
      setParentError("심사 코드를 확인해 주세요.");
      return;
    }

    setParentLoading(true);
    setParentError(null);
    try {
      const result = await apiFetch<{ success: boolean; sessionToken: string }>(
        "/api/parent/review-login",
        {
          method: "POST",
          json: { code },
          skipAuth: true,
        },
      );
      if (!result.success || !result.sessionToken) {
        throw new Error("parent_review_login_failed");
      }
      await saveParentToken(result.sessionToken);
      const profile = await apiFetch<ParentChildrenResponse>(
        "/api/parent/children",
        { parentAuth: true },
      );
      await saveParentCache({
        id: profile.parent.id,
        name: profile.parent.name || "학부모",
        email: profile.parent.email,
        linkedStudentIds: profile.children.map((child) => child.studentId),
      });
      router.replace("/(parent)");
    } catch (error) {
      await clearParentSession();
      if (error instanceof ApiError && error.status === 429) {
        setParentError("잠시 후 다시 시도해 주세요.");
      } else {
        setParentError("심사 코드를 확인해 주세요.");
      }
    } finally {
      setParentLoading(false);
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: "padding", android: "height" })}
      >
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
        <View style={styles.topLogo}>
          <LogoLockup size={brand.logoSize * 2} withWordmark={false} />
          <Text style={styles.loginBrandTitle}>Aura-board</Text>
        </View>
        <View style={styles.loginHeader}>
          <SemanticNav
            style={styles.roleNav}
            accessibilityLabel="로그인 역할 선택"
          >
            <SemanticNavItem
              style={styles.roleNavItem}
              selected={activeRole === "student"}
              onPress={() => setActiveRole("student")}
              accessibilityLabel="학생 로그인"
            >
              학생
            </SemanticNavItem>
            <SemanticNavItem
              style={styles.roleNavItem}
              selected={activeRole === "parent"}
              onPress={() => setActiveRole("parent")}
              accessibilityLabel="학부모 로그인"
            >
              학부모
            </SemanticNavItem>
            <SemanticNavItem
              style={styles.roleNavItem}
              selected={activeRole === "review"}
              onPress={() => setActiveRole("review")}
              accessibilityLabel="심사용 학부모 로그인"
            >
              심사용
            </SemanticNavItem>
          </SemanticNav>
        </View>
        <View
          style={[
            styles.cardRow,
            isNarrow && styles.cardRowNarrow,
            webNarrowContentStyle,
          ]}
        >
          <View
            style={[
              styles.roleCard,
              isNarrow && styles.roleCardNarrow,
              activeRole !== "student" && styles.hiddenRoleCard,
            ]}
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
              <AppButton
                style={styles.studentLoginButton}
                onPress={handleStudentLogin}
                disabled={studentCode.trim().length === 0}
                loading={studentLoading}
              >
                학생 로그인
              </AppButton>
            </View>
          </View>

          <View
            style={[
              styles.roleCard,
              isNarrow && styles.roleCardNarrow,
              activeRole !== "parent" && styles.hiddenRoleCard,
            ]}
          >
            <RoleLineIcon role="parent" />
            <Text style={styles.roleTitle}>학부모</Text>
            <Text style={styles.roleDesc}>
              자녀 작품을 확인해요
            </Text>
            {parentError ? (
              <Text style={styles.parentErrorText} accessibilityRole="alert">
                {parentError}
              </Text>
            ) : null}
            <View style={styles.oauthActions}>
              <ControlPressable
                style={styles.oauthGoogle}
                onPress={() => handleParentOAuth("google")}
                disabled={parentLoading}
                accessibilityLabel="Google로 로그인"
                accessibilityState={{ busy: parentLoading }}
              >
                <GoogleGlyph />
                <Text style={styles.oauthGoogleText}>Google로 로그인</Text>
              </ControlPressable>
              <ControlPressable
                style={styles.oauthKakao}
                onPress={() => handleParentOAuth("kakao")}
                disabled={parentLoading}
                accessibilityLabel="Kakao로 로그인"
                accessibilityState={{ busy: parentLoading }}
              >
                <KakaoGlyph />
                <Text style={styles.oauthKakaoText}>Kakao로 로그인</Text>
              </ControlPressable>
            </View>
          </View>

          <View
            style={[
              styles.roleCard,
              isNarrow && styles.roleCardNarrow,
              activeRole !== "review" && styles.hiddenRoleCard,
            ]}
          >
            <RoleLineIcon role="parent" />
            <Text style={styles.roleTitle}>심사용 학부모</Text>
            <Text style={styles.roleDesc}>심사 코드로 자녀 활동을 확인해요</Text>
            {parentError ? (
              <Text style={styles.parentErrorText} accessibilityRole="alert">
                {parentError}
              </Text>
            ) : null}
            <View style={styles.parentReviewLogin}>
              <TextField
                style={styles.studentCodeInput}
                value={parentReviewCode}
                onChangeText={(text) => {
                  setParentReviewCode(text.toUpperCase());
                  if (parentError) setParentError(null);
                }}
                placeholder="심사 코드 입력"
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                maxLength={auth.codeLength}
                textAlign="center"
                editable={!parentLoading}
                onSubmitEditing={handleParentReviewLogin}
              />
              <AppButton
                onPress={handleParentReviewLogin}
                disabled={parentReviewCode.trim().length === 0}
                loading={parentLoading}
              >
                코드로 로그인
              </AppButton>
            </View>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RoleLineIcon({ role }: { role: "student" | "parent" }) {
  const Icon = role === "student" ? BookOpen : House;
  return (
    <Icon
      size={iconSizes.hero}
      color={colors.text}
      strokeWidth={2}
      accessible={false}
    />
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
  flex: { flex: 1 },
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
  loginHeader: {
    width: "100%",
    maxWidth: layout.roleCardNarrowMaxWidth - spacing.xxl * 2,
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: colors.bg,
  },
  topLogo: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  loginBrandTitle: {
    ...typography.title,
    fontFamily: Platform.select({
      android: "sans-serif-rounded",
      default: typography.title.fontFamily,
    }),
    color: colors.text,
    textAlign: "center",
  },
  roleNav: {
    width: "100%",
  },
  roleNavItem: {
    flex: 1,
    paddingHorizontal: spacing.xs,
  },
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
    minHeight: layout.roleCardMinHeight,
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
  },
  roleCardNarrow: {
    width: "100%",
  },
  hiddenRoleCard: {
    display: "none",
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
    backgroundColor: colors.surface,
    textAlign: "center",
    fontFamily: typography.subtitle.fontFamily,
    fontSize: typography.subtitle.fontSize,
    fontWeight: typography.subtitle.fontWeight,
  },
  studentErrorText: {
    ...typography.micro,
    color: colors.danger,
    textAlign: "center",
  },
  parentErrorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
  },
  studentLoginButton: {
    width: "100%",
  },
  oauthActions: {
    width: "100%",
    gap: spacing.sm,
  },
  parentReviewLogin: {
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
});
