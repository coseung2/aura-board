import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LucideIcon } from "lucide-react-native";
import {
  borders,
  colors,
  iconSizes,
  radii,
  shadows,
  spacing,
  studentNav,
  tapMin,
  typography,
} from "../theme/tokens";
import { ControlPressable } from "./ui";

export type MobileBottomNavItem = {
  id: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  onPress: () => void;
  tinted?: boolean;
  solidActiveIcon?: boolean;
};

type Props = {
  items: MobileBottomNavItem[];
  accessibilityLabel: string;
};

/** Shared student-style bottom navigation used by every mobile role. */
export function MobileBottomNav({ items, accessibilityLabel }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const bottomPadding = isLandscape
    ? insets.bottom
    : Math.max(insets.bottom, spacing.xs);

  return (
    <View
      style={[styles.container, { paddingBottom: bottomPadding }]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.tabRow, isLandscape && styles.tabRowLandscape]}>
        {items.map((item) => {
          const iconSize = isLandscape ? 18 : 20;
          const showActiveCutout = item.active && !item.solidActiveIcon;

          return (
            <ControlPressable
              key={item.id}
              style={[
                styles.tab,
                isLandscape && styles.tabLandscape,
                item.tinted && styles.tintedTab,
                item.active && styles.tabActive,
              ]}
              onPress={item.onPress}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: item.active }}
            >
              <View style={styles.iconWrap} accessible={false}>
                <item.Icon
                  size={iconSize}
                  color={item.active ? colors.text : colors.textMuted}
                  fill={item.active ? colors.text : colors.transparent}
                  strokeWidth={2}
                  accessible={false}
                />
                {showActiveCutout ? (
                  <item.Icon
                    size={iconSize}
                    color={colors.surface}
                    stroke={colors.surface}
                    fill={colors.transparent}
                    strokeWidth={3}
                    style={styles.activeIconCutout}
                    accessible={false}
                  />
                ) : null}
              </View>
              <Text
                style={[styles.tabLabel, item.active && styles.tabTextActive]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </ControlPressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
    ...shadows.lift,
  },
  tabRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xxs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  tabRowLandscape: {
    paddingTop: spacing.none,
    paddingBottom: spacing.none,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.xxs,
    paddingVertical: spacing.xs,
    borderRadius: radii.none,
    borderColor: colors.transparent,
    backgroundColor: colors.transparent,
  },
  tabLandscape: {
    flexDirection: "row",
    flexShrink: 1,
    gap: spacing.xs,
    paddingVertical: spacing.none,
  },
  iconWrap: {
    width: iconSizes.md,
    height: iconSizes.md,
    alignItems: "center",
    justifyContent: "center",
  },
  activeIconCutout: {
    position: "absolute",
  },
  tintedTab: {
    maxWidth: studentNav.dutyTabMaxWidth,
    backgroundColor: colors.accentTintedBg,
    borderRadius: radii.none,
  },
  tabActive: {
    borderColor: colors.transparent,
    backgroundColor: colors.transparent,
    borderRadius: radii.none,
  },
  tabLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.text,
    fontWeight: "700",
  },
});