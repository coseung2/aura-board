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

type SemanticNavVariant = "titled" | "standalone";

type SemanticNavProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  variant?: SemanticNavVariant;
};

const SemanticNavVariantContext = createContext<SemanticNavVariant>("titled");

export function SemanticNav({
  children,
  style,
  accessibilityLabel,
  variant = "titled",
}: SemanticNavProps) {
  return (
    <View
      style={[
        styles.nav,
        variant === "standalone" && styles.navStandalone,
        style,
      ]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      <SemanticNavVariantContext.Provider value={variant}>
        {children}
      </SemanticNavVariantContext.Provider>
    </View>
  );
}

type SemanticNavItemProps = {
  children: ReactNode;
  selected?: boolean;
  tone?: "neutral" | "danger";
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function SemanticNavItem({
  children,
  selected = false,
  tone = "neutral",
  onPress,
  accessibilityLabel,
  style,
}: SemanticNavItemProps) {
  const navVariant = useContext(SemanticNavVariantContext);
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
        navVariant === "standalone" && styles.itemStandalone,
        style,
      ]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
    >
      <Text
        style={[
          styles.text,
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

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  navStandalone: { width: "100%" },
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
  itemStandalone: { flex: 1 },
  text: { ...typography.badge, color: colors.textMuted },
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
