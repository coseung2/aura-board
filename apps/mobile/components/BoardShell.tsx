import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { layoutLabel } from "../theme/layout-meta";

export function BoardHeader({
  title,
  layout,
}: {
  title: string;
  layout: string;
}) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <View style={styles.left}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          hitSlop={8}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="보드 목록으로"
        >
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{layoutLabel(layout)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "rgba(255, 255, 255, 0.86)",
    gap: spacing.md,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 36,
    flex: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.btn,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnPressed: { backgroundColor: colors.surfaceAlt },
  backArrow: { fontSize: 22, color: colors.textMuted },
  title: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.25,
    color: colors.text,
    lineHeight: 28,
    flexShrink: 1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  badgeText: { ...typography.badge, color: colors.textFaint },
});
