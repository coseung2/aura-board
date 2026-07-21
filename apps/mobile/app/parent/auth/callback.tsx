import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { SafeAreaView } from "react-native-safe-area-context";
import { brand, colors, spacing, typography } from "../../../theme/tokens";
import { LogoLockup } from "../../../components/LogoLockup";
import { clearParentSession, saveParentToken } from "../../../lib/session";

/**
 * Expo Go can mount this file-route before the root Linking listener receives
 * an OAuth return URL. Handle the callback here as well so the screen is never
 * left on a permanent "processing" state.
 */
export default function ParentAuthCallback() {
  const router = useRouter();
  const handledUrl = useRef<string | null>(null);

  useEffect(() => {
    async function handle(url: string) {
      if (url === handledUrl.current) return;
      handledUrl.current = url;

      let params: URLSearchParams;
      try {
        const callback = new URL(url);
        params = new URLSearchParams(callback.search);
        for (const [key, value] of new URLSearchParams(callback.hash.slice(1))) {
          if (!params.has(key)) params.set(key, value);
        }
      } catch {
        return;
      }

      const token = params.get("token");
      if (token) {
        await saveParentToken(token);
        router.replace("/(parent)");
        return;
      }

      await clearParentSession();
      const error = params.get("error") ?? "missing_params";
      router.replace(`/?role=parent&error=${encodeURIComponent(error)}`);
    }

    void Linking.getInitialURL().then((url) => {
      if (url) void handle(url);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handle(url);
    });
    return () => subscription.remove();
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.inner}>
        <LogoLockup size={brand.logoSize} wordmarkStyle={styles.brandTitle} />
        <View style={styles.loading} accessibilityLabel="로그인 처리 중" accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={colors.accent} accessibilityLabel="로그인 처리 중" />
          <Text style={styles.text}>로그인 처리 중…</Text>
        </View>
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
  brandTitle: { ...typography.display, color: colors.text },
  loading: { alignItems: "center", gap: spacing.md },
  text: { ...typography.body, color: colors.textMuted, textAlign: "center" },
});
