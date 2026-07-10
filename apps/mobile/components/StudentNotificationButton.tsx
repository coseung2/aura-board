import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { apiFetch, ApiError } from "../lib/api";
import { clearSessionToken } from "../lib/session";
import type { StudentNotificationPayload } from "../lib/types";
import { colors, radii, spacing, studentNav, typography } from "../theme/tokens";
import { ControlPressable } from "./ui";

export function StudentNotificationButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const payload = await apiFetch<StudentNotificationPayload>(
        "/api/student/notifications",
      );
      setCount(payload.count);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearSessionToken();
        router.replace("/(student)/login");
      }
    }
  }, [router]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60_000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      clearInterval(interval);
      appState.remove();
    };
  }, [load, pathname]);

  return (
    <ControlPressable
      style={styles.button}
      onPress={() => router.push("/(student)/notifications")}
      accessibilityLabel={count > 0 ? `알림 ${count}건` : "알림"}
    >
      <Text style={styles.icon}>🔔</Text>
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? "9+" : count}</Text>
        </View>
      ) : null}
    </ControlPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: studentNav.notificationButtonSize,
    minHeight: studentNav.notificationButtonSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    position: "relative",
  },
  icon: { ...typography.section },
  badge: {
    position: "absolute",
    top: spacing.none,
    right: spacing.none,
    minWidth: studentNav.notificationBadgeSize,
    height: studentNav.notificationBadgeSize,
    paddingHorizontal: spacing.xxs,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
  },
  badgeText: { ...typography.micro, color: colors.onAccent, fontWeight: "700" },
});
