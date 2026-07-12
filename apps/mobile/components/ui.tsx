import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ModalProps,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import {
  colors,
  borders,
  composer,
  controls,
  radii,
  shadows,
  navigation,
  spacing,
  states,
  tapMin,
  typography,
} from "../theme/tokens";

type SurfaceProps = ViewProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SurfaceCard({ children, style, ...props }: SurfaceProps) {
  return (
    <View style={[styles.surfaceCard, style]} {...props}>
      {children}
    </View>
  );
}

type SurfacePressableProps = PressableProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SurfacePressable({
  children,
  style,
  disabled,
  ...props
}: SurfacePressableProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.surfaceCard,
        pressed && !disabled && styles.surfacePressed,
        disabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {children}
    </Pressable>
  );
}

type ControlPressableProps = PressableProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ControlPressable({
  children,
  style,
  disabled,
  ...props
}: ControlPressableProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.controlPressable,
        pressed && !disabled && styles.controlPressed,
        disabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {children}
    </Pressable>
  );
}

type SemanticNavProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function SemanticNav({
  children,
  style,
  accessibilityLabel,
}: SemanticNavProps) {
  return (
    <View
      style={[styles.semanticNav, style]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </View>
  );
}

type SemanticNavItemProps = {
  children: ReactNode;
  selected?: boolean;
  tone?: "neutral" | "danger";
  onPress: () => void;
  accessibilityLabel?: string;
};

export function SemanticNavItem({
  children,
  selected = false,
  tone = "neutral",
  onPress,
  accessibilityLabel,
}: SemanticNavItemProps) {
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
      style={styles.semanticNavItem}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
    >
      <Text
        style={[
          styles.semanticNavText,
          selected && styles.semanticNavTextSelected,
          tone === "danger" && selected && styles.semanticNavTextDanger,
        ]}
        numberOfLines={1}
      >
        {children}
      </Text>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.semanticNavActiveLine,
          tone === "danger" && styles.semanticNavActiveLineDanger,
          {
            opacity: activeProgress,
            transform: [{ scaleX: activeProgress }],
          },
        ]}
      />
    </ControlPressable>
  );
}

type MediaPressableProps = PressableProps & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function MediaPressable({
  children,
  style,
  disabled,
  ...props
}: MediaPressableProps) {
  return (
    <Pressable
      disabled={disabled}
      style={style}
      {...props}
    >
      {children}
    </Pressable>
  );
}

type AppModalProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  animationType?: ModalProps["animationType"];
  keyboardAvoiding?: boolean;
  backdropStyle?: StyleProp<ViewStyle>;
  sheetStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  onShow?: ModalProps["onShow"];
  align?: "center" | "right";
  closeOnBackdropPress?: boolean;
};

export function AppModal({
  visible,
  onClose,
  children,
  animationType = "slide",
  keyboardAvoiding,
  backdropStyle,
  sheetStyle,
  accessibilityLabel,
  onShow,
  align = "center",
  closeOnBackdropPress,
}: AppModalProps) {
  const sheet = (
    <View
      onStartShouldSetResponder={() => true}
      style={align === "right" ? styles.modalSideSheetWrap : styles.modalSheetWrap}
    >
      <SurfaceCard
        accessibilityLabel={accessibilityLabel}
        accessibilityViewIsModal={visible}
        importantForAccessibility="yes"
        style={[styles.modalSheet, sheetStyle]}
      >
        {children}
      </SurfaceCard>
    </View>
  );
  const BackdropComponent = closeOnBackdropPress ? Pressable : View;

  return (
    <Modal
      visible={visible}
      animationType={animationType}
      transparent
      onRequestClose={onClose}
      onShow={onShow}
    >
      <BackdropComponent
        onPress={closeOnBackdropPress ? onClose : undefined}
        style={[
          styles.modalBackdrop,
          align === "right" && styles.modalBackdropRight,
          backdropStyle,
        ]}
      >
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboardWrap}
          >
            {sheet}
          </KeyboardAvoidingView>
        ) : (
          sheet
        )}
      </BackdropComponent>
    </Modal>
  );
}

type TextFieldProps = TextInputProps & {
  style?: StyleProp<TextStyle>;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(
  function TextField({ style, ...props }, ref) {
    return (
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textFaint}
        style={[styles.textField, style]}
        {...props}
      />
    );
  },
);

type ButtonVariant = "primary" | "secondary" | "quiet" | "success" | "danger";

type AppButtonProps = PressableProps & {
  children: ReactNode;
  loading?: boolean;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function AppButton({
  children,
  loading,
  variant = "primary",
  style,
  textStyle,
  disabled,
  accessibilityLabel,
  accessibilityState,
  ...props
}: AppButtonProps) {
  const label = accessibilityLabel ?? (typeof children === "string" ? children : undefined);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        ...accessibilityState,
        busy: loading,
        disabled: disabled || loading,
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variantStyles[variant],
        pressed && !disabled && !loading && pressedStyles[variant],
        (disabled || loading) && styles.disabled,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={indicatorColors[variant]}
          accessibilityLabel={label ? `${label} 처리 중` : "처리 중"}
        />
      ) : (
        <Text style={[styles.buttonText, textVariantStyles[variant], textStyle]}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}

type IconButtonProps = PressableProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  children,
  style,
  disabled,
  hitSlop,
  ...props
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={hitSlop ?? iconButtonHitSlop}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && !disabled && styles.iconButtonPressed,
        disabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {children}
    </Pressable>
  );
}

type PillProps = {
  children: ReactNode;
  tone?: "neutral" | "accent" | "danger" | "warning" | "submitted" | "reviewed";
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function Pill({
  children,
  tone = "neutral",
  numberOfLines,
  style,
  textStyle,
}: PillProps) {
  return (
    <View style={[styles.pill, pillStyles[tone], style]}>
      <Text
        numberOfLines={numberOfLines}
        style={[styles.pillText, pillTextStyles[tone], textStyle]}
      >
        {children}
      </Text>
    </View>
  );
}

type FabProps = PressableProps & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Fab({ children, style, disabled, ...props }: FabProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.fab,
        pressed && !disabled && styles.fabPressed,
        disabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {children}
    </Pressable>
  );
}

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  style,
}: EmptyStateProps) {
  return (
    <SurfaceCard style={[styles.emptyState, style]}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? (
        <Text style={styles.emptyDescription}>{description}</Text>
      ) : null}
      {action}
    </SurfaceCard>
  );
}

type AppHeaderProps = {
  title: string;
  titleAccessory?: ReactNode;
  onBack?: () => void;
  right?: ReactNode;
  rightStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
};

export function AppHeader({
  title,
  titleAccessory,
  onBack,
  right,
  rightStyle,
  style,
}: AppHeaderProps) {
  return (
    <View style={[styles.appHeader, style]}>
      {onBack ? (
        <IconButton
          style={styles.appHeaderBack}
          onPress={onBack}
          accessibilityLabel="뒤로가기"
        >
          <Text style={styles.appHeaderBackText}>←</Text>
        </IconButton>
      ) : null}
      <View style={styles.appHeaderTitleGroup}>
        <Text
          accessibilityRole="header"
          style={styles.appHeaderTitle}
          numberOfLines={1}
        >
          {title}
        </Text>
        {titleAccessory}
      </View>
      {right ? (
        <View style={[styles.appHeaderRight, rightStyle]}>{right}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  surfaceCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: borders.hairline,
    borderRadius: radii.card,
    ...shadows.card,
  },
  surfacePressed: {
    borderColor: colors.borderHover,
    backgroundColor: colors.surfaceAlt,
  },
  controlPressable: {
    minHeight: tapMin,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
  },
  controlPressed: {
    borderColor: colors.borderHover,
    backgroundColor: colors.surfaceAlt,
  },
  semanticNav: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  semanticNavItem: {
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
  semanticNavText: {
    ...typography.badge,
    color: colors.textMuted,
  },
  semanticNavTextSelected: {
    color: colors.accentTintedText,
    fontWeight: "700",
  },
  semanticNavTextDanger: {
    color: colors.danger,
  },
  semanticNavActiveLine: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -borders.hairline,
    height: borders.medium,
    backgroundColor: colors.accentTintedText,
  },
  semanticNavActiveLineDanger: {
    backgroundColor: colors.danger,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },
  modalBackdropRight: {
    justifyContent: "flex-start",
    alignItems: "flex-end",
    padding: spacing.none,
  },
  modalSheetWrap: {
    width: "100%",
    maxWidth: composer.sheetMaxWidth,
    maxHeight: composer.sheetMaxHeight,
  },
  modalSideSheetWrap: {
    height: "100%",
  },
  modalKeyboardWrap: {
    width: "100%",
    maxWidth: composer.sheetMaxWidth,
    maxHeight: composer.sheetMaxHeight,
  },
  modalSheet: {
    width: "100%",
    maxWidth: composer.sheetMaxWidth,
    maxHeight: composer.sheetMaxHeight,
    overflow: "hidden",
  },
  button: {
    minHeight: tapMin,
    borderRadius: radii.btn,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.hairline,
  },
  buttonText: {
    ...typography.label,
  },
  disabled: {
    opacity: states.disabledOpacity,
  },
  textField: {
    minHeight: tapMin,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  iconButton: {
    width: controls.iconButton,
    height: controls.iconButton,
    borderRadius: radii.btn,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  pillText: {
    ...typography.badge,
  },
  fab: {
    position: "absolute",
    right: spacing.xl,
    bottom: spacing.xl,
    width: controls.fab,
    height: controls.fab,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.accent,
  },
  fabPressed: {
    backgroundColor: colors.accentActive,
    transform: [{ scale: states.pressedScale }],
  },
  emptyState: {
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.xxl,
  },
  emptyIcon: {
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    ...typography.subtitle,
    color: colors.text,
    textAlign: "center",
  },
  emptyDescription: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  appHeader: {
    height: navigation.headerHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  appHeaderBack: {
    backgroundColor: colors.surfaceAlt,
  },
  appHeaderBackText: {
    ...typography.title,
    color: colors.text,
  },
  appHeaderTitleGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  appHeaderTitle: {
    ...typography.title,
    color: colors.text,
    flexShrink: 1,
  },
  appHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});

const iconButtonHitSlop = Math.max((tapMin - controls.iconButton) / 2, 0);

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    ...shadows.accent,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  quiet: {
    backgroundColor: colors.transparent,
    borderColor: colors.transparent,
  },
  success: {
    backgroundColor: colors.plantActive,
    borderColor: colors.plantActive,
  },
  danger: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
});

const pressedStyles = StyleSheet.create({
  primary: {
    backgroundColor: colors.accentActive,
    borderColor: colors.accentActive,
  },
  secondary: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderHover,
  },
  quiet: {
    backgroundColor: colors.surfaceAlt,
  },
  success: {
    backgroundColor: colors.plantActivePressed,
    borderColor: colors.plantActivePressed,
  },
  danger: {
    backgroundColor: colors.dangerActive,
    borderColor: colors.dangerActive,
  },
});

const textVariantStyles = StyleSheet.create({
  primary: {
    color: colors.onAccent,
  },
  secondary: {
    color: colors.text,
  },
  quiet: {
    color: colors.textMuted,
  },
  success: {
    color: colors.onAccent,
  },
  danger: {
    color: colors.onAccent,
  },
});

const indicatorColors = {
  primary: colors.onAccent,
  secondary: colors.text,
  quiet: colors.textMuted,
  success: colors.onAccent,
  danger: colors.onAccent,
} as const;

const pillStyles = StyleSheet.create({
  neutral: {
    backgroundColor: colors.surfaceAlt,
  },
  accent: {
    backgroundColor: colors.accentTintedBg,
  },
  danger: {
    backgroundColor: colors.statusReturnedBg,
  },
  warning: {
    backgroundColor: colors.warningTintedBg,
  },
  submitted: {
    backgroundColor: colors.statusSubmittedBg,
  },
  reviewed: {
    backgroundColor: colors.statusReviewedBg,
  },
});

const pillTextStyles = StyleSheet.create({
  neutral: {
    color: colors.textMuted,
  },
  accent: {
    color: colors.accentTintedText,
  },
  danger: {
    color: colors.statusReturnedText,
  },
  warning: {
    color: colors.warningTintedText,
  },
  submitted: {
    color: colors.statusSubmittedText,
  },
  reviewed: {
    color: colors.statusReviewedText,
  },
});
