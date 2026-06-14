import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import {
  colors,
  radii,
  shadows,
  spacing,
  tapMin,
  typography,
} from "../../theme/tokens";
import { apiFetch, ApiError } from "../../lib/api";
import { LogoLockup } from "../../components/LogoLockup";

type SignupResponse = {
  ok: boolean;
  message: string;
  devMagicLinkUrl?: string | null;
};

export default function ParentLogin() {
  const router = useRouter();
  const { error: routeError } = useLocalSearchParams<{ error?: string }>();

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
        <View style={styles.brandRow}>
          <LogoLockup
            size={36}
            wordmarkStyle={styles.brandTitle}
          />
          <Text style={styles.brandSub}>학부모 로그인</Text>
        </View>

        <View style={styles.card}>
          {!sent ? (
            <>
              <Text style={styles.heading}>이메일로 로그인</Text>
              <Text style={styles.sub}>
                자녀의 학급에서 등록한 이메일을 입력하면 로그인 링크를 보내드려요.
              </Text>

              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (error) setError(null);
                }}
                placeholder="parent@example.com"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!loading}
                onSubmitEditing={handleSubmit}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                style={({ pressed }) => [
                  styles.submitBtn,
                  (!email.trim() || loading) && styles.submitBtnDisabled,
                  pressed && email.trim() && !loading && styles.submitBtnPressed,
                ]}
                onPress={handleSubmit}
                disabled={!email.trim() || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>로그인 링크 보내기</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.heading}>📧 링크를 보냈어요</Text>
              <Text style={styles.sub}>
                {sentTo} {"\n"}
                {message}
              </Text>

              {devLink ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.devLinkBtn,
                    pressed && styles.devLinkBtnPressed,
                  ]}
                  onPress={handleOpenDevLink}
                >
                  <Text style={styles.devLinkText}>
                    🔧 개발용: 메일 대신 링크 열기
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
                onPress={handleReset}
              >
                <Text style={styles.backText}>다른 이메일로 다시 보내기</Text>
              </Pressable>
            </>
          )}

          <Pressable
            style={({ pressed }) => [styles.textBtn, pressed && styles.textBtnPressed]}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.textBtnText}>← 역할 선택으로 돌아가기</Text>
          </Pressable>
        </View>

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
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  brandTitle: { ...typography.display, color: colors.text },
  brandSub: { ...typography.subtitle, color: colors.textMuted },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    ...shadows.card,
    padding: spacing.xxl,
    gap: spacing.lg,
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
  devLinkBtn: {
    backgroundColor: colors.accentTintedBg,
    borderRadius: radii.card,
    paddingVertical: spacing.lg,
    alignItems: "center",
    minHeight: tapMin,
  },
  devLinkBtnPressed: { backgroundColor: "#dbeafe" },
  devLinkText: { ...typography.label, color: colors.accentTintedText },
  backBtn: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  backBtnPressed: { opacity: 0.6 },
  backText: { ...typography.label, color: colors.textMuted },
  textBtn: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  textBtnPressed: { opacity: 0.6 },
  textBtnText: { ...typography.label, color: colors.textMuted },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
  hint: {
    ...typography.micro,
    color: colors.textFaint,
    textAlign: "center",
    lineHeight: 18,
  },
});
