import { useRouter, type Href } from "expo-router";
import { Grid3X3, StretchHorizontal } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
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

export type ParentNavItem = "feed" | "home";
type LegacyParentDestination = "notifications" | "add" | "account";

type Props = {
  active: ParentNavItem | LegacyParentDestination;
  notificationCount?: number;
  onFeedPress?: () => void;
  /** @deprecated Compatibility for the former default Home/feed tab. */
  onHomePress?: () => void;
};

const ITEMS: Array<{
  name: ParentNavItem;
  label: string;
  route: Href;
  Icon: typeof StretchHorizontal;
}> = [
  { name: "feed", label: "피드", route: "/(parent)", Icon: StretchHorizontal },
  { name: "home", label: "홈", route: "/(parent)/home", Icon: Grid3X3 },
];

export function ParentBottomNav({ active, onFeedPress, onHomePress }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.xs) }]}
      accessibilityRole="tablist"
      accessibilityLabel="학부모 주요 메뉴"
    >
      {ITEMS.map(({ name, label, route, Icon }) => {
        const selected = active === name;
        return (
          <ControlPressable
            key={name}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: Boolean(selected) }}
            onPress={() => {
              if (name === "feed" && selected) {
                (onFeedPress ?? onHomePress)?.();
                return;
              }
              router.replace(route);
            }}
            style={[styles.tab, selected && styles.tabSelected]}
          >
            <Icon
              size={iconSizes.lg}
              color={selected ? colors.accent : colors.textMuted}
              strokeWidth={selected ? 2.4 : 2}
              accessible={false}
            />
            <Text style={[styles.label, selected && styles.labelActive]}>{label}</Text>
          </ControlPressable>
        );
      })}
    </View>
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
    borderRadius: radii.control,
    backgroundColor: colors.transparent,
  },
  tabSelected: { backgroundColor: colors.accentTintedBg },
  label: { ...typography.micro, color: colors.textMuted, fontWeight: "600" },
  labelActive: { color: colors.accent },
});
