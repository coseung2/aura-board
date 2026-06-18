import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { borders, colors, controls, iconSizes, spacing, typography } from "../theme/tokens";
import { layoutLabel } from "../theme/layout-meta";
import { IconButton, Pill } from "./ui";

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
        <IconButton
          hitSlop={8}
          onPress={() => router.back()}
          accessibilityLabel="보드 목록으로"
        >
          <Text style={styles.backArrow}>←</Text>
        </IconButton>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Pill>{layoutLabel(layout)}</Pill>
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
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgAlt,
    gap: spacing.md,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: controls.iconButton,
    flex: 1,
  },
  backArrow: { fontSize: iconSizes.md, color: colors.textMuted },
  title: {
    ...typography.title,
    color: colors.text,
    flexShrink: 1,
  },
});
