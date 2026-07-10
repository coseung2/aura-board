import { ScrollView, StyleSheet, Text, View } from "react-native";
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
  typography,
} from "../theme/tokens";
import type { StudentDuty } from "../lib/types";
import {
  isStudentNavTargetActive,
  studentBaseNavTargets,
  studentDutyTarget,
  type StudentNavTarget,
} from "../lib/student-navigation";
import { ControlPressable } from "./ui";
import { StudentNotificationButton } from "./StudentNotificationButton";

type Props = {
  studentName?: string;
  classroomName?: string;
  duties?: StudentDuty[];
  loggingOut?: boolean;
  onLogout: () => void;
};

export function StudentBottomNav({
  studentName,
  classroomName,
  duties = [],
  loggingOut,
  onLogout,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, spacing.xs);
  const targets = [
    ...studentBaseNavTargets,
    ...duties
      .map(studentDutyTarget)
      .filter((target): target is StudentNavTarget => target !== null),
  ];

  return (
    <View style={[styles.container, { paddingBottom: bottomPadding }]}>
      <View style={styles.accountRow}>
        <View style={styles.accountText}>
          <Text selectable style={styles.studentName} numberOfLines={1}>
            {studentName ?? "학생"}
          </Text>
          <Text selectable style={styles.classroomName} numberOfLines={1}>
            {classroomName ?? "학급"}
          </Text>
        </View>
        <View style={styles.accountActions}>
          <StudentNotificationButton />
          <ControlPressable
            style={styles.logoutButton}
            onPress={onLogout}
            disabled={loggingOut}
            accessibilityLabel="로그아웃"
          >
            <Text style={styles.logoutText}>
              {loggingOut ? "로그아웃 중" : "로그아웃"}
            </Text>
          </ControlPressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {targets.map((target) => {
          const active = isStudentNavTargetActive(target, pathname);
          const isDuty = target.id.startsWith("duty:");
          return (
            <ControlPressable
              key={target.id}
              style={[
                styles.tab,
                isDuty && styles.dutyTab,
                active && styles.tabActive,
              ]}
              onPress={() => {
                if (!active) router.push(target.href as Href);
              }}
              accessibilityLabel={target.label}
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabEmoji, active && styles.tabTextActive]}>
                {target.emoji}
              </Text>
              <Text
                style={[styles.tabLabel, active && styles.tabTextActive]}
                numberOfLines={1}
              >
                {target.label}
              </Text>
            </ControlPressable>
          );
        })}
      </ScrollView>
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
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  accountText: {
    flex: 1,
    minWidth: spacing.none,
  },
  accountActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  studentName: {
    ...typography.label,
    color: colors.text,
  },
  classroomName: {
    ...typography.micro,
    color: colors.textMuted,
  },
  logoutButton: {
    minWidth: studentNav.logoutMinWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  logoutText: {
    ...typography.badge,
    color: colors.textMuted,
  },
  tabRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  tab: {
    minWidth: studentNav.tabMinWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderColor: colors.transparent,
    backgroundColor: colors.transparent,
  },
  dutyTab: {
    maxWidth: studentNav.dutyTabMaxWidth,
    backgroundColor: colors.accentTintedBg,
  },
  tabActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
  },
  tabEmoji: {
    ...typography.section,
    color: colors.textMuted,
  },
  tabLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.accentTintedText,
    opacity: states.visibleOpacity,
  },
});
