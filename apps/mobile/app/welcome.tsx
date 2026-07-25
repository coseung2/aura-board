import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { colors, typography } from "../theme/tokens";

const HOLD_BEFORE = 600;
const ANIMATE = 900;
const HOLD_AFTER = 1500;
const TOTAL = HOLD_BEFORE + ANIMATE + HOLD_AFTER;

const WELCOME_BACKGROUND = colors.bg;
const SPLASH_ICON_ASSET = require("../assets/splash-icon.png");
const SPLASH_ICON_SIZE = 112;
const FINAL_ICON_SIZE = 56;
const FINAL_ICON_SCALE = FINAL_ICON_SIZE / SPLASH_ICON_SIZE;
const LOCKUP_GAP = 16;
const DIVIDER_WIDTH = 1;
const WORDMARK_WIDTH = 190;
const FINAL_LOCKUP_OFFSET_X = 24;
const FINAL_ICON_LEFT = FINAL_LOCKUP_OFFSET_X;
const WORDMARK_LEFT = FINAL_ICON_LEFT + FINAL_ICON_SIZE + LOCKUP_GAP;
const STAGE_WIDTH = WORDMARK_LEFT + DIVIDER_WIDTH + LOCKUP_GAP + WORDMARK_WIDTH;
const STAGE_HEIGHT = SPLASH_ICON_SIZE;
const FINAL_ICON_TOP = (STAGE_HEIGHT - FINAL_ICON_SIZE) / 2;
const INITIAL_ICON_TRANSLATE_X =
  STAGE_WIDTH / 2 - FINAL_ICON_LEFT - FINAL_ICON_SIZE / 2;
const WORDMARK_TOP = (STAGE_HEIGHT - FINAL_ICON_SIZE) / 2;
const WORDMARK_HEIGHT = FINAL_ICON_SIZE;
const DIVIDER_HEIGHT = 42;

export default function WelcomeScreen() {
  const router = useRouter();
  const progress = useRef(new Animated.Value(0)).current;
  const [rootLaidOut, setRootLaidOut] = useState(false);
  const [iconLoaded, setIconLoaded] = useState(false);
  const hasStartedRef = useRef(false);

  const handleRootLayout = useCallback((_event: LayoutChangeEvent) => {
    setRootLaidOut(true);
  }, []);

  const handleIconLoadEnd = useCallback(() => {
    setIconLoaded(true);
  }, []);

  useEffect(() => {
    if (!rootLaidOut || !iconLoaded || hasStartedRef.current) return;

    hasStartedRef.current = true;
    let cancelled = false;
    let animationTimer: ReturnType<typeof setTimeout> | null = null;
    let routeTimer: ReturnType<typeof setTimeout> | null = null;

    const startWelcome = async () => {
      await SplashScreen.hideAsync().catch(() => null);
      if (cancelled) return;

      animationTimer = setTimeout(() => {
        if (cancelled) return;
        Animated.timing(progress, {
          toValue: 1,
          duration: ANIMATE,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }).start();
      }, HOLD_BEFORE);

      routeTimer = setTimeout(() => {
        if (cancelled) return;
        // Return through the normal landing route so an existing student or
        // parent session is restored instead of being forced through login.
        router.replace("/");
      }, TOTAL);
    };

    void startWelcome();

    return () => {
      cancelled = true;
      if (animationTimer) clearTimeout(animationTimer);
      if (routeTimer) clearTimeout(routeTimer);
      progress.stopAnimation();
    };
  }, [iconLoaded, progress, rootLaidOut, router]);

  const iconTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [INITIAL_ICON_TRANSLATE_X, 0],
  });
  const iconScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, FINAL_ICON_SCALE],
  });
  const wordmarkTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  return (
    <View onLayout={handleRootLayout} style={styles.container}>
      <View style={styles.center}>
        <View style={styles.stage}>
          <Animated.View
            style={[styles.iconLayer, { transform: [{ translateX: iconTranslateX }] }]}
          >
            <Animated.Image
              source={SPLASH_ICON_ASSET}
              onLoadEnd={handleIconLoadEnd}
              resizeMode="contain"
              fadeDuration={0}
              style={[styles.splashIcon, { transform: [{ scale: iconScale }] }]}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.textBlock,
              {
                opacity: progress,
                transform: [{ translateX: wordmarkTranslateX }],
              },
            ]}
          >
            <View style={styles.divider} />
            <View style={styles.wordmarkWrap}>
              <Text style={styles.wordmark}>AURA BOARD</Text>
              <Text style={styles.subLabel}>LEARNING WORKSPACE</Text>
            </View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WELCOME_BACKGROUND,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stage: {
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  iconLayer: {
    position: "absolute",
    left: FINAL_ICON_LEFT,
    top: FINAL_ICON_TOP,
    width: FINAL_ICON_SIZE,
    height: FINAL_ICON_SIZE,
  },
  splashIcon: {
    position: "absolute",
    left: -(SPLASH_ICON_SIZE - FINAL_ICON_SIZE) / 2,
    top: -(SPLASH_ICON_SIZE - FINAL_ICON_SIZE) / 2,
    width: SPLASH_ICON_SIZE,
    height: SPLASH_ICON_SIZE,
  },
  textBlock: {
    position: "absolute",
    left: WORDMARK_LEFT,
    top: WORDMARK_TOP,
    height: WORDMARK_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: LOCKUP_GAP,
  },
  divider: {
    width: DIVIDER_WIDTH,
    height: DIVIDER_HEIGHT,
    backgroundColor: colors.border,
  },
  wordmarkWrap: {
    width: WORDMARK_WIDTH,
    height: WORDMARK_HEIGHT,
    justifyContent: "center",
  },
  wordmark: {
    ...typography.display,
    fontFamily: Platform.select({
      android: "sans-serif-rounded",
      default: "NotoSansKR_700Bold",
    }),
    fontWeight: "900",
    color: colors.text,
    includeFontPadding: false,
    textAlign: "left",
  },
  subLabel: {
    ...typography.micro,
    marginTop: 2,
    color: colors.textFaint,
    includeFontPadding: false,
    textAlign: "left",
  },
});
