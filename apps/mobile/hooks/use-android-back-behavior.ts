import { useEffect, useRef } from "react";
import { BackHandler, Platform, ToastAndroid } from "react-native";
import { useSegments } from "expo-router";

const EXIT_CONFIRMATION_WINDOW_MS = 2_000;
const EXIT_CONFIRMATION_MESSAGE = "한 번 더 누르면 앱이 종료됩니다";
const STUDENT_ROOT_TABS = new Set([
  "boards",
  "portfolio",
  "reading",
  "walking",
  "more",
  "wallet",
  "slime",
  "notifications",
  "bank",
  "pay",
  "check",
  "cleaning",
  "shoes",
]);

/**
 * Handle Android's system back button for the custom bottom-navigation shell.
 *
 * Bottom-navigation screens are intentionally kept in the navigation stack by
 * the existing router calls. Treating those screens as roots here prevents a
 * hardware back press from returning to a different tab. Nested routes (board
 * and child detail screens, for example) are left to React Navigation so its
 * normal stack behavior is preserved.
 */
export function useAndroidBackBehavior() {
  const segments = useSegments();
  const routeKey = segments.join("/");
  const isRootTab = isRootTabRoute(segments);
  const lastBackAtRef = useRef(0);

  useEffect(() => {
    lastBackAtRef.current = 0;
  }, [routeKey]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (!isRootTab) return false;

        const now = Date.now();
        if (now - lastBackAtRef.current < EXIT_CONFIRMATION_WINDOW_MS) {
          lastBackAtRef.current = 0;
          BackHandler.exitApp();
          return true;
        }

        lastBackAtRef.current = now;
        ToastAndroid.show(EXIT_CONFIRMATION_MESSAGE, ToastAndroid.SHORT);
        return true;
      },
    );

    return () => subscription.remove();
  }, [isRootTab, routeKey]);
}

function isRootTabRoute(segments: readonly string[]): boolean {
  if (segments.length === 0) return true;

  const scope = segments[0];
  if (scope !== "(student)" && scope !== "(parent)") return false;

  // Login is a normal auth flow and does not render a bottom navigation bar.
  if (segments[1] === "login") return false;

  if (scope === "(parent)") {
    return segments.length === 1 ||
      (segments.length === 2 &&
        (segments[1] === "home" || segments[1] === "walking"));
  }

  return segments.length === 1 ||
    (segments.length === 2 && STUDENT_ROOT_TABS.has(segments[1] ?? ""));
}
