import { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import {
  auth,
  brand,
  colors,
  layout,
  responsive,
  spacing,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { webSafeWidthStyle } from "../../lib/responsive";
import { LogoLockup } from "../../components/LogoLockup";
import { AppButton, SurfaceCard, TextField } from "../../components/ui";

type SignupResponse = {
  ok: boolean;
  message: string;
  devMagicLinkUrl?: string | null;
};

export default function ParentLogin() {
  const router = useRouter();
  const { error: routeError } = useLocalSearchParams<{ error?: string }>();
  const { width } = useWindowDimensions();
  const isNarrow = width < layout.mobileBreakpoint;
  const webSafeAuthStyle = webSafeWidthStyle(width, {
    inset: responsive.authCardWebSafeInset,
  });

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  useEffect(() => {
    const initial = Array.isArray(routeError) ? routeError[0] : routeError;
    if (initial) setError(initial);
  }, [routeError]);

  async function handleSubmit() {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("올바른 이메일을 입력해 주세요.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch<SignupResponse>("/api/parent/signup", {
        method: "POST",
        json: { email: trimmed, client: "mobile" },
        skipAuth: true,
      });

      setSent(true);
      setSentTo(trimmed);
      setMessage(res.message ?? "이메일로 로그인 링크를 보냈어요.");
      setDevLink(res.devMagicLinkUrl ?? null);
    } catch (e) {
      let msg = "로그인 링크를 보내지 못했어요.";
      if (e instanceof ApiError) {
        const body = e.body as Record<string, unknown> | string | null;
        if (body && typeof body === "object" && typeof body.message === "string") {
          msg = body.message;
        } else if (typeof body === "string" && body) {
          msg = body;
        }
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setSent(false);
    setSentTo("");
    setMessage(null);
    setDevLink(null);
    setEmail("");
    setError(null);
  }

  async function handleOpenDevLink() {
    if (devLink) await Linking.openURL(devLink);
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
          {!sent ? (
            <>
              <Text style={styles.heading}>이메일로 로그인</Text>
              <Text style={styles.sub}>
                자녀의 학급에서 등록한 이메일을 입력하면 로그인 링크를 보내드려요.
              </Text>

              <TextField
                style={styles.input}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (error) setError(null);
                }}
                placeholder="parent@example.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!loading}
                onSubmitEditing={handleSubmit}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <AppButton
                onPress={handleSubmit}
                disabled={!email.trim() || loading}
                loading={loading}
              >
                로그인 링크 보내기
              </AppButton>
            </>
          ) : (
            <>
              <Text style={styles.heading}>📧 링크를 보냈어요</Text>
              <Text style={styles.sub}>
                {sentTo} {"\n"}
                {message}
              </Text>

              {devLink ? (
                <AppButton
                  variant="secondary"
                  onPress={handleOpenDevLink}
                >
                  🔧 개발용: 메일 대신 링크 열기
                </AppButton>
              ) : null}

              <AppButton
                variant="quiet"
                onPress={handleReset}
              >
                다른 이메일로 다시 보내기
              </AppButton>
            </>
          )}

          <AppButton
            variant="quiet"
            onPress={() => router.replace("/")}
          >
            ← 역할 선택으로 돌아가기
          </AppButton>
        </SurfaceCard>

        <Text style={styles.hint}>
          메일이 안 온 경우 스팸함을 확인해 주세요.
        </Text>
      </View>
    </SafeAreaView>
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
  input: {
    backgroundColor: colors.bg,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
  hint: {
    ...typography.micro,
    color: colors.textFaint,
    textAlign: "center",
  },
});
