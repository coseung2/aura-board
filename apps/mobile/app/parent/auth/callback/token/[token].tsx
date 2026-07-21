import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, typography } from "../../../../../theme/tokens";
import { saveParentToken } from "../../../../../lib/session";

/** Expo Go-only OAuth handoff. The dynamic path survives Expo Go routing. */
export default function ParentAuthTokenCallback() {
  const router = useRouter();
  const handled = useRef(false);
  const { token: routeToken } = useLocalSearchParams<{
    token?: string | string[];
  }>();

  useEffect(() => {
    const token = Array.isArray(routeToken) ? routeToken[0] : routeToken;
    if (!token || handled.current) return;
    handled.current = true;
    void saveParentToken(token).then(() => router.replace("/(parent)"));
  }, [routeToken, router]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.text}>로그인 처리 중…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  loading: { alignItems: "center", gap: spacing.md },
  text: { ...typography.body, color: colors.textMuted },
});
