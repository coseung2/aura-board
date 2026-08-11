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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import {
  styles,
  iconButtonHitSlop,
  variantStyles,
  pressedStyles,
  textVariantStyles,
  indicatorColors,
  pillStyles,
  pillTextStyles,
} from "./ui.styles";

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

type BarePressableProps = PressableProps & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Interaction-only pressable with no border, background, or minimum size. */
export const BarePressable = forwardRef<View, BarePressableProps>(
  function BarePressable({ children, style, ...props }, ref) {
    return (
      <Pressable ref={ref} style={style} {...props}>
        {children}
      </Pressable>
    );
  },
);

type AppOverlayModalProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  animationType?: ModalProps["animationType"];
  statusBarTranslucent?: boolean;
};

/** Unstyled full-screen modal primitive for custom focus layers and overlays. */
export function AppOverlayModal({
  visible,
  onClose,
  children,
  animationType = "fade",
  statusBarTranslucent = true,
}: AppOverlayModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      statusBarTranslucent={statusBarTranslucent}
      onRequestClose={onClose}
    >
      {children}
    </Modal>
  );
}

/** A non-card pressable for inline text actions such as delete and dismiss. */
export function TextActionPressable({
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
        styles.textActionPressable,
        pressed && !disabled && styles.textActionPressed,
        disabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {children}
    </Pressable>
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
            behavior={Platform.OS === "ios" ? "padding" : "height"}
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
  /** Optional full-screen layer rendered above the sheet and its backdrop. */
  overlay?: ReactNode;
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
  overlay,
}: AppBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  const dismissRef = useRef<() => void>(() => undefined);
  onCloseRef.current = onClose;
  const flattenedSheetStyle = StyleSheet.flatten(sheetStyle) ?? {};
  const contentPaddingBottom =
    typeof flattenedSheetStyle.paddingBottom === "number"
      ? flattenedSheetStyle.paddingBottom
      : 0;
  const safePaddingBottom = contentPaddingBottom + insets.bottom;

  useEffect(() => {
    if (!visible) return;
    // A previous sheet can still be finishing its dismiss animation when the
    // parent immediately opens this component for a different record. Cancel
    // that stale callback so it cannot close the newly opened sheet.
    translateY.stopAnimation();
    translateY.setValue(0);
  }, [accessibilityLabel, translateY, visible]);

  dismissRef.current = () => {
    // Close synchronously. Keeping a transparent native Modal mounted during a
    // dismissal animation can leave an invisible touch-blocking window over a
    // newly opened sheet on Android.
    translateY.stopAnimation();
    translateY.setValue(0);
    onCloseRef.current();
  };

  const panResponder = useRef(
    PanResponder.create({
      // This responder exists only on the dedicated handle area. Claim the
      // gesture at touch-down so Android native Modals keep delivering move
      // events; waiting until movement can lose the stream entirely.
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        translateY.stopAnimation();
      },
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
      style={[
        styles.bottomSheet,
        sheetStyle,
        { paddingBottom: safePaddingBottom, transform: [{ translateY }] },
      ]}
    >
      <View
        {...panResponder.panHandlers}
        style={styles.bottomSheetHandleArea}
        collapsable={false}
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
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.bottomSheetKeyboardWrap}
          >
            {sheet}
          </KeyboardAvoidingView>
        ) : (
          sheet
        )}
        {overlay}
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
