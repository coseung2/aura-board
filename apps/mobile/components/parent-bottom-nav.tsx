import { useRouter, type Href } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  borders,
  colors,
  parent,
  spacing,
  studentNav,
  typography,
} from "../theme/tokens";
import { ControlPressable } from "./ui";

type Props = {
  classroomId?: string | null;
  onFeedPress?: () => void;
  onLogout: () => void;
};

export function ParentBottomNav({
  classroomId,
  onFeedPress,
  onLogout,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const targets = [
    {
      id: "feed",
      label: "피드",
      emoji: "⌂",
      selected: true,
      onPress: onFeedPress,
      disabled: false,
    },
    {
      id: "showcase",
      label: "자랑해요",
      emoji: "☆",
      selected: false,
      onPress: () => {
        if (!classroomId) return;
        router.push({
          pathname: "/(parent)/showcase",
          params: { classroomId },
        } as unknown as Href);
      },
      disabled: !classroomId,
    },
    {
      id: "link",
      label: "자녀 연결",
      emoji: "+",
      selected: false,
      onPress: () => router.push("/(parent)/link-child"),
      disabled: false,
    },
    {
      id: "logout",
      label: "로그아웃",
      emoji: "↪",
      selected: false,
      onPress: onLogout,
      disabled: false,
    },
  ];

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.xs) }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {targets.map((target) => (
          <ControlPressable
            key={target.id}
            style={[styles.tab, target.selected && styles.tabSelected]}
            onPress={target.onPress}
            disabled={target.disabled}
            accessibilityLabel={target.label}
            accessibilityState={{
              selected: target.selected,
              disabled: target.disabled,
            }}
          >
            <Text style={[styles.emoji, target.selected && styles.textSelected]}>
              {target.emoji}
            </Text>
            <Text style={[styles.label, target.selected && styles.textSelected]}>
              {target.label}
            </Text>
          </ControlPressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth: borders.hairline,
    borderTopColor: colors.border,
  },
  row: {
    flexGrow: 1,
    justifyContent: "space-around",
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    gap: spacing.xs,
  },
  tab: {
    minWidth: studentNav.tabMinWidth,
    minHeight: parent.feedTabMinHeight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderColor: colors.transparent,
    backgroundColor: colors.transparent,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
  },
  tabSelected: { backgroundColor: colors.accentTintedBg },
  emoji: { ...typography.subtitle, color: colors.textMuted },
  label: { ...typography.micro, color: colors.textMuted },
  textSelected: { color: colors.accentTintedText },
});
