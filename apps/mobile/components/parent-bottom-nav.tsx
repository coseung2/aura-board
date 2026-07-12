import { useRouter, type Href } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  borders,
  colors,
  iconSizes,
  parent,
  radii,
  spacing,
  typography,
} from "../theme/tokens";
import { ControlPressable } from "./ui";

export type ParentNavItem = "home" | "notifications" | "add" | "account";

type Props = {
  active: ParentNavItem;
  notificationCount?: number;
  onHomePress?: () => void;
};

const ROUTES: Record<ParentNavItem, Href> = {
  home: "/(parent)",
  notifications: "/(parent)/notifications",
  add: "/(parent)/link-child",
  account: "/(parent)/account",
};

const LABELS: Record<ParentNavItem, string> = {
  home: "홈",
  notifications: "알림",
  add: "추가",
  account: "계정",
};

export function ParentBottomNav({
  active,
  notificationCount = 0,
  onHomePress,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const items = Object.keys(ROUTES) as ParentNavItem[];

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, spacing.xs) },
      ]}
      accessibilityRole="tablist"
    >
      {items.map((item) => {
        const selected = active === item;
        const badge = item === "notifications" ? notificationCount : 0;
        return (
          <ControlPressable
            key={item}
            accessibilityRole="tab"
            accessibilityLabel={LABELS[item]}
            accessibilityState={{ selected }}
            onPress={() => {
              if (item === "home" && selected && onHomePress) {
                onHomePress();
                return;
              }
              router.push(ROUTES[item]);
            }}
            style={[styles.tab, selected && styles.tabSelected]}
          >
            <View style={styles.iconWrap}>
              <ParentNavIcon name={item} active={selected} />
              {badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{Math.min(badge, 99)}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, selected && styles.labelActive]}>
              {LABELS[item]}
            </Text>
          </ControlPressable>
        );
      })}
    </View>
  );
}

function ParentNavIcon({ name, active }: { name: ParentNavItem; active: boolean }) {
  const stroke = active ? colors.accent : colors.textMuted;
  return (
    <Svg
      width={iconSizes.lg}
      height={iconSizes.lg}
      viewBox="0 0 24 24"
      fill="none"
    >
      {name === "home" ? (
        <>
          <Path d="M3 10.8 12 3l9 7.8" stroke={stroke} strokeWidth={1.8} />
          <Path d="M5.5 9.7V21h13V9.7M9.5 21v-6.5h5V21" stroke={stroke} strokeWidth={1.8} />
        </>
      ) : name === "notifications" ? (
        <>
          <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" stroke={stroke} strokeWidth={1.8} />
          <Path d="M10 21h4" stroke={stroke} strokeWidth={1.8} />
        </>
      ) : name === "add" ? (
        <>
          <Rect x={3} y={3} width={18} height={18} rx={5} stroke={stroke} strokeWidth={1.8} />
          <Path d="M12 8v8M8 12h8" stroke={stroke} strokeWidth={1.8} />
        </>
      ) : (
        <>
          <Circle cx={12} cy={8} r={4} stroke={stroke} strokeWidth={1.8} />
          <Path d="M4.5 21a7.5 7.5 0 0 1 15 0" stroke={stroke} strokeWidth={1.8} />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: parent.feedTabMinHeight + spacing.sm,
    flexDirection: "row",
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceGlassStrong,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: parent.feedTabMinHeight,
    marginHorizontal: spacing.xs,
    marginVertical: spacing.xs,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xxs,
    borderWidth: borders.none,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
  tabSelected: {
    borderRadius: radii.control,
    borderColor: colors.accentTintedBg,
    backgroundColor: colors.accentTintedBg,
  },
  iconWrap: { position: "relative" },
  label: { ...typography.micro, color: colors.textMuted, fontWeight: "600" },
  labelActive: { color: colors.accent },
  badge: {
    position: "absolute",
    top: -6,
    right: -11,
    minWidth: iconSizes.sm,
    height: iconSizes.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
    borderWidth: borders.medium,
    borderColor: colors.surface,
  },
  badgeText: { ...typography.micro, color: colors.onAccent },
});
