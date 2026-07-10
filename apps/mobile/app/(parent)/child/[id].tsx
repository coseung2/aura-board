import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { saveParentSelectedChild } from "../../../lib/session";
import { colors, spacing, typography } from "../../../theme/tokens";

// Backwards-compatible deep link. The current parent experience keeps child
// switching inside the single home feed, matching the web redirect behavior.
export default function ParentChildRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();

  useEffect(() => {
    const studentId = typeof id === "string" ? id : "";
    void (async () => {
      if (studentId) await saveParentSelectedChild(studentId);
      router.replace("/(parent)");
    })();
  }, [id, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text selectable style={styles.text}>자녀 피드로 이동하고 있어요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  text: { ...typography.body, color: colors.textMuted },
});
