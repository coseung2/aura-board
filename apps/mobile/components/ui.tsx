import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
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
import { ArrowLeft } from "lucide-react-native";
import { DailyBanner, useDailyBannerScope } from "./DailyBanner";
import {
  colors,
  borders,
  composer,
  controls,
  iconSizes,
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
      style={[styles.semanticNavItem, style]}
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
    <Pressable disabled={disabled} style={style} {...props}>
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
      style={
        align === "right" ? styles.modalSideSheetWrap : styles.modalSheetWrap
      }
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

type AppBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
  backdropStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  keyboardAvoiding?: boolean;
};

/** Shared draggable bottom sheet for mobile flows. */
export function AppBottomSheet({
  visible,
  onClose,
  children,
  sheetStyle,
  backdropStyle,
  accessibilityLabel,
  keyboardAvoiding,
}: AppBottomSheetProps) {
  const translateY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  const dismissRef = useRef<() => void>(() => undefined);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [translateY, visible]);

  dismissRef.current = () => {
    Animated.timing(translateY, {
      toValue: 720,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      translateY.setValue(0);
      onCloseRef.current();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        translateY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > 104 || gesture.vy > 0.7) {
          dismissRef.current();
          return;
        }
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const sheet = (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      accessibilityViewIsModal={visible}
      importantForAccessibility="yes"
      style={[styles.bottomSheet, sheetStyle, { transform: [{ translateY }] }]}
    >
      <View
        {...panResponder.panHandlers}
        style={styles.bottomSheetHandleArea}
        accessibilityLabel={
          accessibilityLabel ? `${accessibilityLabel} 닫기` : "시트 닫기"
        }
        accessibilityHint="아래로 끌어 닫기"
      >
        <View style={styles.bottomSheetHandle} />
      </View>
      {children}
    </Animated.View>
  );

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={() => dismissRef.current()}
      statusBarTranslucent
    >
      <View style={styles.bottomSheetRoot}>
        <Pressable
          style={[styles.bottomSheetBackdrop, backdropStyle]}
          onPress={() => dismissRef.current()}
          accessibilityRole="button"
          accessibilityLabel={
            accessibilityLabel ? `${accessibilityLabel} 닫기` : "시트 닫기"
          }
        />
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.bottomSheetKeyboardWrap}
          >
            {sheet}
          </KeyboardAvoidingView>
        ) : (
          sheet
        )}
      </View>
    </Modal>
  );
}

type TextFieldProps = TextInputProps & {
  style?: StyleProp<TextStyle>;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(
  function TextField({ style, multiline, ...props }, ref) {
    return (
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textFaint}
        multiline={multiline}
        style={[
          styles.textField,
          multiline ? styles.textFieldMultiline : styles.textFieldSingleLine,
          style,
        ]}
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
  const label =
    accessibilityLabel ?? (typeof children === "string" ? children : undefined);

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
        <Text
          style={[styles.buttonText, textVariantStyles[variant], textStyle]}
        >
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
  showDailyBanner?: boolean;
};

export function AppHeader({
  title,
  titleAccessory,
  onBack,
  right,
  rightStyle,
  style,
  showDailyBanner = true,
}: AppHeaderProps) {
  const dailyBannerScope = useDailyBannerScope();
  const shouldRenderBanner =
    showDailyBanner &&
    dailyBannerScope !== null &&
    !(
      dailyBannerScope.role === "parent" &&
      dailyBannerScope.studentId === undefined
    );

  return (
    <>
      <View
        style={[
          styles.appHeader,
          shouldRenderBanner && styles.appHeaderWithBanner,
          style,
        ]}
      >
        {onBack ? (
          <IconButton
            style={styles.appHeaderBack}
            onPress={onBack}
            accessibilityLabel="뒤로가기"
          >
            <ArrowLeft
              size={iconSizes.md}
              color={colors.text}
              strokeWidth={2}
            />
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
      {shouldRenderBanner && dailyBannerScope ? (
        <DailyBanner
          role={dailyBannerScope.role}
          studentId={dailyBannerScope.studentId}
        />
      ) : null}
    </>
  );
}

type SectionHeaderProps = {
  title: string;
  titleAccessory?: ReactNode;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SectionHeader({
  title,
  titleAccessory,
  right,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionHeaderCopy}>
        <View style={styles.sectionHeaderTitleRow}>
          <Text
            accessibilityRole="header"
            style={styles.sectionHeaderTitle}
            numberOfLines={1}
          >
            {title}
          </Text>
          {titleAccessory}
        </View>
      </View>
      {right ? <View style={styles.sectionHeaderRight}>{right}</View> : null}
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
    maxHeight: "100%",
  },
  modalSideSheetWrap: {
    height: "100%",
  },
  modalKeyboardWrap: {
    width: "100%",
    maxWidth: composer.sheetMaxWidth,
    height: composer.sheetMaxHeight,
    justifyContent: "center",
  },
  modalSheet: {
    width: "100%",
    maxWidth: composer.sheetMaxWidth,
    maxHeight: "100%",
    overflow: "hidden",
  },
  bottomSheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  bottomSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.modalBackdrop,
  },
  bottomSheetKeyboardWrap: {
    width: "100%",
    justifyContent: "flex-end",
  },
  bottomSheet: {
    maxHeight: "90%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    overflow: "hidden",
  },
  bottomSheetHandleArea: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  bottomSheetHandle: {
    width: spacing.xxl,
    height: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.borderHover,
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
    minHeight: controls.inputHeight,
    borderWidth: borders.hairline,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    includeFontPadding: false,
  },
  textFieldSingleLine: {
    paddingVertical: spacing.none,
    textAlignVertical: "center",
  },
  textFieldMultiline: {
    minHeight: controls.multilineInputMinHeight,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    textAlignVertical: "top",
    lineHeight: typography.body.lineHeight,
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
  appHeaderWithBanner: {
    borderBottomWidth: borders.none,
  },
  appHeaderBack: {
    backgroundColor: colors.transparent,
  },
  appHeaderTitleGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
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
  sectionHeader: {
    minHeight: tapMin + spacing.xs,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md,
    borderBottomWidth: borders.hairline,
    borderBottomColor: colors.border,
  },
  sectionHeaderCopy: {
    flex: 1,
    minWidth: 0,
    minHeight: tapMin + spacing.xs,
    paddingBottom: spacing.xs,
    justifyContent: "flex-end",
  },
  sectionHeaderTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    flexWrap: "nowrap",
  },
  sectionHeaderTitle: {
    ...typography.subtitle,
    color: colors.text,
    flexShrink: 1,
  },
  sectionHeaderRight: {
    flexShrink: 0,
    alignSelf: "flex-end",
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
