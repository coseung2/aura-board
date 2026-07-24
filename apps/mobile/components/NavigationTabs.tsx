import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  borders,
  colors,
  radii,
  spacing,
  tapMin,
  typography,
} from "../theme/tokens";
import { ControlPressable } from "./ui";

type NavigationLayout = "section" | "content";

type NavigationProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
};

const NavigationLayoutContext = createContext<NavigationLayout>("section");

function NavigationTabs({
  children,
  style,
  accessibilityLabel,
  layout,
}: NavigationProps & { layout: NavigationLayout }) {
  return (
    <View
      style={[styles.nav, layout === "content" && styles.contentTabs, style]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      <NavigationLayoutContext.Provider value={layout}>
        {children}
      </NavigationLayoutContext.Provider>
    </View>
  );
}

export function SectionNav(props: NavigationProps) {
  return <NavigationTabs {...props} layout="section" />;
}

export function ContentTabs(props: NavigationProps) {
  return <NavigationTabs {...props} layout="content" />;
}

type NavigationItemProps = {
  children: ReactNode;
  selected?: boolean;
  tone?: "neutral" | "danger";
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

function NavigationItem({
  children,
  selected = false,
  tone = "neutral",
  onPress,
  accessibilityLabel,
  style,
}: NavigationItemProps) {
  const layout = useContext(NavigationLayoutContext);
  const activeProgress = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    const animation = Animated.timing(activeProgress, {
      toValue: selected ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [activeProgress, selected]);

  return (
    <ControlPressable
      style={[
        styles.item,
        style,
        layout === "content" && styles.contentTab,
      ]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
    >
      <Text
        style={[
          styles.text,
          layout === "content" && styles.contentText,
          selected && styles.textSelected,
          tone === "danger" && selected && styles.textDanger,
        ]}
        numberOfLines={1}
      >
        {children}
      </Text>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.activeLine,
          tone === "danger" && styles.activeLineDanger,
          {
            opacity: activeProgress,
            transform: [{ scaleX: activeProgress }],
          },
        ]}
      />
    </ControlPressable>
  );
}

export function SectionNavItem(props: NavigationItemProps) {
  return <NavigationItem {...props} />;
}

export function ContentTab(props: NavigationItemProps) {
  return <NavigationItem {...props} />;
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  contentTabs: { width: "100%" },
  item: {
    minHeight: tapMin,
    minWidth: 0,
    flexShrink: 1,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    alignItems: "center",
    justifyContent: "flex-end",
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
    position: "relative",
  },
  contentTab: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  text: { ...typography.badge, color: colors.textMuted },
  contentText: { width: "100%", textAlign: "center" },
  textSelected: { color: colors.accentTintedText, fontWeight: "700" },
  textDanger: { color: colors.danger },
  activeLine: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -borders.hairline,
    height: borders.medium,
    backgroundColor: colors.accentTintedText,
  },
  activeLineDanger: { backgroundColor: colors.danger },
});
