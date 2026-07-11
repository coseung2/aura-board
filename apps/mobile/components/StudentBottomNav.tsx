import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { usePathname, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Bell,
  BookOpen,
  BriefcaseBusiness,
  BrushCleaning,
  CheckCircle2,
  CircleHelp,
  Footprints,
  Home,
  Landmark,
  LayoutGrid,
  MoreHorizontal,
  Palette,
  ShoppingCart,
  WalletCards,
  type LucideIcon,
} from "lucide-react-native";
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
import { ControlPressable } from "./ui";

type Props = {
  duties?: StudentDuty[];
};

const targetIcons: Record<string, LucideIcon> = {
  home: Home,
  boards: LayoutGrid,
  portfolio: BriefcaseBusiness,
  reading: BookOpen,
  walking: Footprints,
  more: MoreHorizontal,
  wallet: WalletCards,
  canva: Palette,
  notifications: Bell,
};

const dutyIcons: Record<string, LucideIcon> = {
  banker: Landmark,
  "store-clerk": ShoppingCart,
  checker: CheckCircle2,
  "cleaning-inspector": BrushCleaning,
  "shoe-inspector": Footprints,
};

function iconForTarget(target: StudentNavTarget): LucideIcon {
  if (target.id.startsWith("duty:")) {
    const roleKey = target.id.slice(target.id.lastIndexOf(":") + 1);
    return dutyIcons[roleKey] ?? CircleHelp;
  }
  return targetIcons[target.id] ?? CircleHelp;
}

export function StudentBottomNav({ duties = [] }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const bottomPadding = isLandscape
    ? insets.bottom
    : Math.max(insets.bottom, spacing.xs);
  const scrollViewRef = useRef<ScrollView>(null);
  const tabLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});
  const [viewportWidth, setViewportWidth] = useState(0);
  const [optionalTargetIds, setOptionalTargetIds] = useState<string[]>([]);
  const optionalTargets = [
    ...studentOptionalNavTargets,
    ...duties.map(studentDutyTarget).filter((target): target is StudentNavTarget => target !== null),
  ];
  const targets = [
    ...studentBaseNavTargets,
    ...optionalTargetIds
      .map((id) => optionalTargets.find((target) => target.id === id))
      .filter((target): target is StudentNavTarget => target !== undefined),
  ];
  const activeTargetId = targets.find((target) =>
    isStudentNavTargetActive(target, pathname),
  )?.id;
  const targetKey = targets.map((target) => target.id).join("|");

  const scrollActiveTabIntoView = useCallback(
    (targetId?: string) => {
      if (!targetId || viewportWidth <= 0) return;
      const layout = tabLayoutsRef.current[targetId];
      if (!layout) return;
      const x = Math.max(0, layout.x + layout.width / 2 - viewportWidth / 2);
      scrollViewRef.current?.scrollTo({ x, animated: true });
    },
    [viewportWidth],
  );

  useEffect(() => {
    void loadStudentNavPreferences().then(setOptionalTargetIds);
    return subscribeStudentNavPreferences(setOptionalTargetIds);
  }, []);

  useEffect(() => {
    scrollActiveTabIntoView(activeTargetId);
  }, [activeTargetId, pathname, targetKey, scrollActiveTabIntoView]);

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: bottomPadding },
      ]}
    >
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.tabRow, isLandscape && styles.tabRowLandscape]}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setViewportWidth((current) => (current === width ? current : width));
        }}
      >
        {targets.map((target) => {
          const active = isStudentNavTargetActive(target, pathname);
          const isDuty = target.id.startsWith("duty:");
          const Icon = iconForTarget(target);
          return (
            <ControlPressable
              key={target.id}
              style={[
                styles.tab,
                isLandscape && styles.tabLandscape,
                isDuty && styles.dutyTab,
                active && styles.tabActive,
              ]}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                tabLayoutsRef.current[target.id] = { x, width };
                if (active) scrollActiveTabIntoView(target.id);
              }}
              onPress={() => {
                if (!active) router.push(target.href as Href);
              }}
              accessibilityLabel={target.label}
              accessibilityState={{ selected: active }}
            >
              <Icon
                size={isLandscape ? 18 : 20}
                color={active ? colors.accentTintedText : colors.textMuted}
                strokeWidth={2}
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
  tabRow: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  tabRowLandscape: {
    flexGrow: 1,
    minWidth: "100%",
    paddingTop: spacing.none,
    paddingBottom: spacing.none,
  },
  tab: {
    minWidth: studentNav.tabMinWidth,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.none,
    borderColor: colors.transparent,
    backgroundColor: colors.transparent,
  },
  tabLandscape: {
    flexDirection: "row",
    flexGrow: 1,
    flexBasis: 0,
    flexShrink: 0,
    minWidth: tapMin,
    gap: spacing.xs,
    paddingVertical: spacing.none,
  },
  dutyTab: {
    maxWidth: studentNav.dutyTabMaxWidth,
    backgroundColor: colors.accentTintedBg,
    borderRadius: radii.none,
  },
  tabActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentTintedBg,
    borderRadius: radii.none,
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
