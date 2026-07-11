import { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import Svg, { Path } from "react-native-svg";
import {
  auth,
  borders,
  brand,
  colors,
  iconSizes,
  layout,
  radii,
  responsive,
  spacing,
  states,
  tapMin,
  typography,
} from "../../theme/tokens";
import { getApiBase } from "../../lib/api";
import { webSafeWidthStyle } from "../../lib/responsive";
import { LogoLockup } from "../../components/LogoLockup";
import {
  AppButton,
  ControlPressable,
  SurfaceCard,
} from "../../components/ui";

type OAuthProvider = "google" | "kakao";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  provider_disabled:
    "현재 OAuth 로그인이 비활성화되어 있어요. 관리자에게 문의해 주세요.",
  invalid_provider: "지원하지 않는 로그인 방식이에요.",
  invalid_state: "로그인 인증이 만료되었어요. 다시 시도해 주세요.",
  missing_params: "로그인 응답이 올바르지 않아요. 다시 시도해 주세요.",
  missing_pkce: "보안 정보가 누락되었어요. 다시 시도해 주세요.",
  token_exchange_failed: "로그인 토큰 교환에 실패했어요. 잠시 후 다시 시도해 주세요.",
  userinfo_failed: "사용자 정보 조회에 실패했어요. 잠시 후 다시 시도해 주세요.",
  upsert_failed: "계정 생성에 실패했어요. 잠시 후 다시 시도해 주세요.",
};

export default function ParentLogin() {
  const router = useRouter();
  const { error: routeError } = useLocalSearchParams<{ error?: string }>();
  const { width } = useWindowDimensions();
  const isNarrow = width < layout.mobileBreakpoint;
  const webSafeAuthStyle = webSafeWidthStyle(width, {
    inset: responsive.authCardWebSafeInset,
  });

  const [openingProvider, setOpeningProvider] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initial = Array.isArray(routeError) ? routeError[0] : routeError;
    if (initial) {
      setError(
        OAUTH_ERROR_MESSAGES[initial] ??
          `로그인 중 오류가 발생했어요. (${initial})`,
      );
    }
  }, [routeError]);

  async function handleOAuth(provider: OAuthProvider) {
    const providerLabel = provider === "google" ? "Google" : "Kakao";
    const url = new URL(`/api/parent/auth/${provider}`, getApiBase());
    if (Platform.OS !== "web") {
      url.searchParams.set("client", "mobile");
    }
    setError(null);
    setOpeningProvider(provider);
    try {
      if (
        Platform.OS === "web" &&
        typeof window !== "undefined" &&
        typeof window.location?.assign === "function"
      ) {
        window.location.assign(url.toString());
        return;
      }
      await Linking.openURL(url.toString());
    } catch {
      setError(`${providerLabel} 로그인을 시작하지 못했어요.`);
      setOpeningProvider(null);
    } finally {
      if (typeof window === "undefined") {
        setOpeningProvider(null);
      }
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.inner}>
        <View style={[styles.brandRow, isNarrow && styles.brandRowNarrow, webSafeAuthStyle]}>
          <LogoLockup
            size={brand.logoSize}
            wordmarkStyle={styles.brandTitle}
          />
          <Text style={styles.brandSub}>학부모 로그인</Text>
        </View>

        <SurfaceCard style={[styles.card, webSafeAuthStyle]}>
          <Text style={styles.heading}>학부모 로그인</Text>
          <Text style={styles.sub}>
            Google 또는 Kakao 계정으로 빠르게 시작할 수 있어요.
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.oauthActions}>
            <ControlPressable
              style={[
                styles.oauthButton,
                styles.oauthGoogle,
                openingProvider && styles.oauthDisabled,
              ]}
              onPress={() => handleOAuth("google")}
              disabled={openingProvider !== null}
              accessibilityLabel="Google로 로그인"
            >
              <GoogleGlyph />
              <Text style={styles.oauthGoogleText}>
                {openingProvider === "google" ? "Google 로그인 중..." : "Google로 로그인"}
              </Text>
            </ControlPressable>
            <ControlPressable
              style={[
                styles.oauthButton,
                styles.oauthKakao,
                openingProvider && styles.oauthDisabled,
              ]}
              onPress={() => handleOAuth("kakao")}
              disabled={openingProvider !== null}
              accessibilityLabel="Kakao로 로그인"
            >
              <KakaoGlyph />
              <Text style={styles.oauthKakaoText}>
                {openingProvider === "kakao" ? "Kakao 로그인 중..." : "Kakao로 로그인"}
              </Text>
            </ControlPressable>
          </View>

          {__DEV__ ? (
            <AppButton
              variant="quiet"
              onPress={() => router.push("/(parent)/dev-preview")}
              accessibilityLabel="개발용 학부모 피드 미리보기 열기"
            >
              개발용 미리보기
            </AppButton>
          ) : null}

          <AppButton
            variant="quiet"
            onPress={() => router.replace("/")}
          >
            ← 역할 선택으로 돌아가기
          </AppButton>
        </SurfaceCard>
      </View>
    </SafeAreaView>
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
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  brandRowNarrow: {
    flexDirection: "column",
  },
  brandTitle: { ...typography.display, color: colors.text },
  brandSub: { ...typography.subtitle, color: colors.textMuted },
  card: {
    width: "100%",
    maxWidth: auth.cardMaxWidth,
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  heading: { ...typography.title, color: colors.text },
  sub: { ...typography.body, color: colors.textMuted },
  oauthActions: {
    width: "100%",
    gap: spacing.sm,
  },
  oauthButton: {
    width: "100%",
    height: tapMin,
    borderRadius: radii.btn,
    borderWidth: borders.hairline,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  oauthGoogle: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  oauthKakao: {
    borderColor: colors.oauthKakao,
    backgroundColor: colors.oauthKakao,
  },
  oauthDisabled: {
    opacity: states.disabledOpacity,
  },
  oauthGoogleText: {
    ...typography.label,
    color: colors.text,
  },
  oauthKakaoText: {
    ...typography.label,
    color: colors.text,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
});
