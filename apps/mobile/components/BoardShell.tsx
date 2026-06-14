import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { layoutEmoji, layoutLabel } from "../theme/layout-meta";
import { LogoLockup } from "./LogoLockup";

// 보드 상단의 공통 헤더. Aura-board 브랜드 로고 + 제목 + 레이아웃 배지 + 뒤로가기.

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
      <Pressable
        style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        hitSlop={8}
        onPress={() => router.back()}
      >
        <Text style={styles.backArrow}>←</Text>
      </Pressable>
      <LogoLockup
        size={28}
        wordmarkStyle={styles.logoWordmark}
      />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.badge}>
        <Text style={styles.badgeEmoji}>{layoutEmoji(layout)}</Text>
        <Text style={styles.badgeText}>{layoutLabel(layout)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  backBtnPressed: { backgroundColor: colors.border },
  backArrow: { fontSize: 24, color: colors.text },
  logoWordmark: {
    fontSize: 14,
    letterSpacing: -0.2,
  },
  title: { ...typography.title, color: colors.text, flex: 1 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.accentTintedBg,
  },
  badgeEmoji: { fontSize: 18 },
  badgeText: { ...typography.label, color: colors.accentTintedText },
});
