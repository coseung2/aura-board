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
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import Svg, { Path } from "react-native-svg";
import { BookOpen, House } from "lucide-react-native";
import {
  brand,
  borders,
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
  getLogoutInProgressRole,
  loadSessionToken,
  loadParentToken,
  saveParentCache,
  saveParentToken,
  saveSessionToken,
  saveStudentCache,
} from "../lib/session";
import {
  apiFetch,
  ApiError,
  getApiBase,
  getParentApiBase,
  parentApiFetch,
} from "../lib/api";
import {
  BOARD_LIST_CACHE_KEY,
  STUDENT_HOME_CACHE_KEY,
  hydrateBoardCache,
  readBoardCache,
  writeBoardCache,
} from "../lib/board-cache";
import { webSafeWidthStyle } from "../lib/responsive";
import { LogoLockup } from "../components/LogoLockup";
import {
  AppButton,
  ControlPressable,
  TextActionPressable,
  TextField,
} from "../components/ui";
import { ContentTab, ContentTabs } from "../components/NavigationTabs";
import type {
  MeResponse,
  ParentChildrenResponse,
  StudentAuthResponse,
} from "../lib/types";
import { styles } from "./landing.styles";
import {
  isAppleLoginCancellation,
  isAppleParentLoginAvailable,
  signInWithAppleParent,
} from "../lib/parent-apple-login";
import {
  TermsNotice,
  RoleLineIcon,
  GoogleGlyph,
  KakaoGlyph,
} from "./landing-presentation";

// 랜딩 화면 — 학생 / 학부모 역할 선택.
// 기존 세션이 있으면 해당 역할 대시보드로 자동 이동.

type ParentOAuthProvider = "google" | "kakao";

const PARENT_OAUTH_CALLBACK_PATH = "parent/auth/callback";
const EXPO_GO_PHONE_CALLBACK = "exp://127.0.0.1:8081/--/parent/auth/callback";
// Student join codes are fixed at six characters, but the server-side review
// credential contract accepts any non-empty code up to 256 characters. Keep
// the reviewer field aligned with that contract so short Expo Go codes (for
// example, "367") are submitted instead of being rejected client-side.
const PARENT_REVIEW_CODE_MAX_LENGTH = 256;
const PARENT_REVIEW_UI_ENABLED: boolean = false;

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

function parentAuthErrorMessage(
  value: string | string[] | undefined,
): string | null {
  const initial = Array.isArray(value) ? value[0] : value;
  if (!initial) return null;
  return PARENT_OAUTH_ERROR_MESSAGES[initial] ?? initial;
}

export function Landing() {
  const router = useRouter();
  const { role: routeRole, error: routeError } = useLocalSearchParams<{
    role?: string | string[];
    error?: string | string[];
  }>();
  const requestedRole: "student" | "parent" | "review" | null =
    (Array.isArray(routeRole) ? routeRole[0] : routeRole) === "parent"
      ? "parent"
      : (Array.isArray(routeRole) ? routeRole[0] : routeRole) === "review"
        ? PARENT_REVIEW_UI_ENABLED
          ? "review"
          : "parent"
        : (Array.isArray(routeRole) ? routeRole[0] : routeRole) === "student"
          ? "student"
          : null;
  const logoutRole = getLogoutInProgressRole();
  const { width } = useWindowDimensions();
  const [booting, setBooting] = useState(
    requestedRole === null && logoutRole === null,
  );
  const [studentCode, setStudentCode] = useState("");
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [parentLoading, setParentLoading] = useState(false);
  const [appleLoginAvailable, setAppleLoginAvailable] = useState(false);
  const [parentAuthMode, setParentAuthMode] = useState<
    "social" | "login" | "signup"
  >("social");
  const [parentUsername, setParentUsername] = useState("");
  const [parentPassword, setParentPassword] = useState("");
  const [parentPasswordConfirm, setParentPasswordConfirm] = useState("");
  const [parentReviewCode, setParentReviewCode] = useState("");
  const [parentError, setParentError] = useState<string | null>(() =>
    parentAuthErrorMessage(routeError),
  );
  const [activeRole, setActiveRole] = useState<"student" | "parent" | "review">(
    requestedRole ?? logoutRole ?? "student",
  );
  const isNarrow = width < layout.mobileBreakpoint;
  const webNarrowContentStyle = webSafeWidthStyle(width, {
    enabled: isNarrow,
    inset: responsive.roleWebSafeInset,
    maxWidth: layout.roleCardNarrowMaxWidth,
  });

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    void isAppleParentLoginAvailable()
      .then(setAppleLoginAvailable)
      .catch(() => setAppleLoginAvailable(false));
  }, []);

  useEffect(() => {
    if (requestedRole || logoutRole) {
      setActiveRole(requestedRole ?? logoutRole ?? "student");
      setBooting(false);
      return;
    }

    (async () => {
      try {
        // 기존 학생 세션 확인
        const studentToken = await loadSessionToken();
        if (studentToken) {
          await hydrateBoardCache();
          if (
            readBoardCache<MeResponse>(STUDENT_HOME_CACHE_KEY, {
              kind: "boards",
            })
          ) {
            // Route immediately with the last successful snapshot. The student
            // layout performs the normal stale-while-revalidate request.
            router.replace("/(student)");
            return;
          }
          const me = await apiFetch<MeResponse>("/api/student/me");
          writeBoardCache(STUDENT_HOME_CACHE_KEY, me, { kind: "boards" });
          writeBoardCache(BOARD_LIST_CACHE_KEY, me.boards, { kind: "boards" });
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
  }, [logoutRole, requestedRole, router]);

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
        } else if (e.status === 408) {
          setStudentError("서버 연결이 지연되고 있어요. 잠시 후 다시 시도해 주세요.");
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
    const oauthBase = getParentApiBase();
    const url = new URL(`/api/parent/auth/${provider}`, oauthBase);
    const isExpoGoPhysicalAndroid =
      Platform.OS === "android" &&
      __DEV__ &&
      Device.isDevice &&
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    const redirectUri = isExpoGoPhysicalAndroid
      ? EXPO_GO_PHONE_CALLBACK
      : Linking.createURL(PARENT_OAUTH_CALLBACK_PATH);
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

  async function handleParentAppleSignIn() {
    if (parentLoading) return;
    setParentError(null);
    setParentLoading(true);
    try {
      const result = await signInWithAppleParent();
      await saveParentToken(result.token);
      router.replace("/(parent)");
    } catch (error) {
      if (!isAppleLoginCancellation(error)) {
        setParentError("Apple 로그인을 완료하지 못했어요. 다시 시도해 주세요.");
      }
    } finally {
      setParentLoading(false);
    }
  }

  async function handleParentReviewLogin() {
    const code = parentReviewCode.trim().toUpperCase();
    if (code.length === 0 || code.length > PARENT_REVIEW_CODE_MAX_LENGTH) {
      setParentError("심사 코드를 확인해 주세요.");
      return;
    }

    setParentLoading(true);
    setParentError(null);
    try {
      const result = await parentApiFetch<{
        success: boolean;
        sessionToken: string;
      }>("/api/parent/review-login", {
        method: "POST",
        json: { code },
        skipAuth: true,
      });
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

  async function handleParentPasswordSubmit() {
    const username = parentUsername.trim().toLowerCase();
    if (username.length < 4 || parentPassword.length < 8) {
      setParentError("아이디는 4자 이상, 비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    if (
      parentAuthMode === "signup" &&
      parentPassword !== parentPasswordConfirm
    ) {
      setParentError("비밀번호가 서로 일치하지 않아요.");
      return;
    }

    setParentLoading(true);
    setParentError(null);
    let tokenStored = false;
    try {
      if (parentAuthMode === "signup") {
        await parentApiFetch("/api/account/credentials/signup", {
          method: "POST",
          json: { role: "parent", username, password: parentPassword },
          skipAuth: true,
        });
      }

      const result = await parentApiFetch<{
        success: boolean;
        sessionToken: string;
      }>("/api/parent/credentials/login", {
        method: "POST",
        json: { username, password: parentPassword },
        skipAuth: true,
      });
      if (!result.success || !result.sessionToken)
        throw new Error("password_login_failed");

      await saveParentToken(result.sessionToken);
      tokenStored = true;
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
      if (tokenStored) await clearParentSession();
      if (error instanceof ApiError && error.status === 409) {
        setParentError("이미 사용 중인 아이디예요.");
      } else if (error instanceof ApiError && error.status === 429) {
        setParentError("시도 횟수가 많아요. 잠시 후 다시 시도해 주세요.");
      } else if (parentAuthMode === "signup") {
        setParentError(
          "회원가입을 완료하지 못했어요. 입력 내용을 확인해 주세요.",
        );
      } else {
        setParentError("아이디 또는 비밀번호를 확인해 주세요.");
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
            <ContentTabs
              style={styles.roleNav}
              accessibilityLabel="로그인 역할 선택"
            >
              <ContentTab
                style={styles.roleNavItem}
                selected={activeRole === "student"}
                onPress={() => setActiveRole("student")}
                accessibilityLabel="학생 로그인"
              >
                학생
              </ContentTab>
              <ContentTab
                style={styles.roleNavItem}
                selected={activeRole === "parent"}
                onPress={() => setActiveRole("parent")}
                accessibilityLabel="학부모 로그인"
              >
                학부모
              </ContentTab>
              {PARENT_REVIEW_UI_ENABLED ? (
                <ContentTab
                  style={styles.roleNavItem}
                  selected={activeRole === "review"}
                  onPress={() => setActiveRole("review")}
                  accessibilityLabel="심사용 학부모 로그인"
                >
                  심사용
                </ContentTab>
              ) : null}
            </ContentTabs>
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
              <Text style={styles.roleDesc}>QR/코드로 학급에 참여해요</Text>
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
                styles.parentRoleCard,
                isNarrow && styles.roleCardNarrow,
                activeRole !== "parent" && styles.hiddenRoleCard,
              ]}
            >
              <RoleLineIcon role="parent" />
              <Text style={styles.roleTitle}>학부모</Text>
              <Text style={styles.roleDesc}>자녀 작품을 확인해요</Text>
              {parentError ? (
                <Text style={styles.parentErrorText} accessibilityRole="alert">
                  {parentError}
                </Text>
              ) : null}
              {parentAuthMode === "social" ? (
                <View style={styles.oauthActions}>
                  {Platform.OS === "ios" && appleLoginAvailable ? (
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={
                        AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                      }
                      buttonStyle={
                        AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                      }
                      cornerRadius={radii.btn}
                      style={styles.oauthApple}
                      onPress={handleParentAppleSignIn}
                    />
                  ) : null}
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
                  <TextActionPressable
                    style={styles.credentialTextAction}
                    onPress={() => {
                      setParentAuthMode("login");
                      setParentError(null);
                    }}
                    accessibilityLabel="아이디로 로그인"
                  >
                    <Text style={styles.credentialTextActionLabel}>
                      아이디로 로그인
                    </Text>
                  </TextActionPressable>
                </View>
              ) : (
                <View style={styles.credentialForm}>
                  <TextField
                    value={parentUsername}
                    onChangeText={(value) => {
                      setParentUsername(value.toLowerCase());
                      setParentError(null);
                    }}
                    placeholder="아이디"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    editable={!parentLoading}
                    accessibilityLabel="학부모 아이디"
                  />
                  <TextField
                    value={parentPassword}
                    onChangeText={(value) => {
                      setParentPassword(value);
                      setParentError(null);
                    }}
                    placeholder="비밀번호"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={
                      parentAuthMode === "signup"
                        ? "new-password"
                        : "current-password"
                    }
                    editable={!parentLoading}
                    accessibilityLabel="학부모 비밀번호"
                  />
                  {parentAuthMode === "signup" ? (
                    <TextField
                      value={parentPasswordConfirm}
                      onChangeText={(value) => {
                        setParentPasswordConfirm(value);
                        setParentError(null);
                      }}
                      placeholder="비밀번호 확인"
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="new-password"
                      editable={!parentLoading}
                      onSubmitEditing={handleParentPasswordSubmit}
                      accessibilityLabel="학부모 비밀번호 확인"
                    />
                  ) : null}
                  <AppButton
                    style={styles.studentLoginButton}
                    onPress={handleParentPasswordSubmit}
                    disabled={!parentUsername.trim() || !parentPassword}
                    loading={parentLoading}
                  >
                    {parentAuthMode === "signup" ? "회원가입" : "로그인"}
                  </AppButton>
                  <View style={styles.credentialModeActions}>
                    <TextActionPressable
                      style={styles.credentialTextAction}
                      onPress={() => {
                        setParentAuthMode(
                          parentAuthMode === "signup" ? "login" : "signup",
                        );
                        setParentPasswordConfirm("");
                        setParentError(null);
                      }}
                    >
                      <Text style={styles.credentialTextActionLabel}>
                        {parentAuthMode === "signup"
                          ? "이미 계정이 있나요? 로그인"
                          : "계정이 없나요? 회원가입"}
                      </Text>
                    </TextActionPressable>
                    <TextActionPressable
                      style={styles.credentialTextAction}
                      onPress={() => {
                        setParentAuthMode("social");
                        setParentError(null);
                      }}
                    >
                      <Text style={styles.credentialTextActionLabel}>
                        소셜 로그인으로 돌아가기
                      </Text>
                    </TextActionPressable>
                  </View>
                </View>
              )}
            </View>

            {PARENT_REVIEW_UI_ENABLED ? (
              <View
                style={[
                  styles.roleCard,
                  isNarrow && styles.roleCardNarrow,
                  activeRole !== "review" && styles.hiddenRoleCard,
                ]}
              >
                <RoleLineIcon role="parent" />
                <Text style={styles.roleTitle}>심사용 학부모</Text>
                <Text style={styles.roleDesc}>
                  심사 코드로 자녀 활동을 확인해요
                </Text>
                {parentError ? (
                  <Text
                    style={styles.parentErrorText}
                    accessibilityRole="alert"
                  >
                    {parentError}
                  </Text>
                ) : null}
                <View style={styles.studentLoginForm}>
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
                    maxLength={PARENT_REVIEW_CODE_MAX_LENGTH}
                    textAlign="center"
                    editable={!parentLoading}
                    onSubmitEditing={handleParentReviewLogin}
                  />
                  <AppButton
                    style={styles.studentLoginButton}
                    onPress={handleParentReviewLogin}
                    disabled={parentReviewCode.trim().length === 0}
                    loading={parentLoading}
                  >
                    코드로 로그인
                  </AppButton>
                </View>
              </View>
            ) : null}
          </View>
          <TermsNotice />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default Landing;
