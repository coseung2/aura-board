import { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { usePathname, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  borders,
  colors,
  radii,
  shadows,
  spacing,
  states,
  studentNav,
  tapMin,
  typography,
} from "../theme/tokens";
import type { StudentDuty } from "../lib/types";
import {
  isStudentNavTargetActive,
  loadStudentNavPreferences,
  studentBaseNavTargets,
  studentDutyTarget,
  studentOptionalNavTargets,
  subscribeStudentNavPreferences,
  type StudentNavTarget,
} from "../lib/student-navigation";
import { studentNavIcon } from "../lib/student-navigation-icons";
import { ControlPressable } from "./ui";

type Props = {
  duties?: StudentDuty[];
};

export function StudentBottomNav({ duties = [] }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const bottomPadding = isLandscape
    ? insets.bottom
    : Math.max(insets.bottom, spacing.xs);
  const [targetIds, setTargetIds] = useState<string[]>(() =>
    studentBaseNavTargets.map((target) => target.id),
  );
  const allTargets = [
    ...studentBaseNavTargets,
    ...studentOptionalNavTargets,
    ...duties.map(studentDutyTarget).filter((target): target is StudentNavTarget => target !== null),
  ];
  const targets = targetIds
    .map((id) => allTargets.find((target) => target.id === id))
    .filter((target): target is StudentNavTarget => target !== undefined);

  useEffect(() => {
    void loadStudentNavPreferences().then(setTargetIds);
    return subscribeStudentNavPreferences(setTargetIds);
  }, []);

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: bottomPadding },
      ]}
    >
      <View
        style={[styles.tabRow, isLandscape && styles.tabRowLandscape]}
      >
        {targets.map((target) => {
          const active = isStudentNavTargetActive(target, pathname);
          const isDuty = target.id.startsWith("duty:");
          const Icon = studentNavIcon(target);
          return (
            <ControlPressable
              key={target.id}
              style={[
                styles.tab,
                isLandscape && styles.tabLandscape,
                isDuty && styles.dutyTab,
                active && styles.tabActive,
              ]}
              onPress={() => {
                if (!active) router.push(target.href as Href);
              }}
              accessibilityLabel={target.label}
              accessibilityState={{ selected: active }}
            >
              <Icon
                size={isLandscape ? 18 : 20}
                color={active ? colors.text : colors.textMuted}
                fill={active ? colors.text : colors.transparent}
                strokeWidth={active ? 1.75 : 2}
              />
              <Text
                style={[styles.tabLabel, active && styles.tabTextActive]}
                numberOfLines={1}
              >
                {target.label}
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
  dutyTab: {
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
    opacity: states.visibleOpacity,
  },
});
