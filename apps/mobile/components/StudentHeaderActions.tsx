import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { LogOut } from "lucide-react-native";
import { apiFetch } from "../lib/api";
import { clearSessionToken } from "../lib/session";
import {
  borders,
  colors,
  iconSizes,
  radii,
  spacing,
  tapMin,
} from "../theme/tokens";
import { ControlPressable } from "./ui";
import { StudentNotificationButton } from "./StudentNotificationButton";

export function StudentHeaderActions() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const loggingOutRef = useRef(false);

  async function handleLogout() {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    setLoggingOut(true);
    try {
      // The server logout is best effort. Start it without holding up the
      // local cleanup or navigation when the request is slow or unavailable.
      void apiFetch("/api/student/logout", { method: "POST" }).catch(
        () => undefined,
      );
      await clearSessionToken();
      router.dismissAll();
      router.replace("/?role=student");
    } finally {
      loggingOutRef.current = false;
      setLoggingOut(false);
    }
  }

  return (
    <View style={styles.container}>
      <StudentNotificationButton />
      <ControlPressable
        style={styles.logoutButton}
        onPress={handleLogout}
        disabled={loggingOut}
        accessibilityLabel={loggingOut ? "로그아웃 중" : "로그아웃"}
        accessibilityState={{ disabled: loggingOut }}
      >
        <LogOut
          size={iconSizes.md}
          color={colors.textMuted}
          strokeWidth={2}
          accessible={false}
        />
      </ControlPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 0,
  },
  logoutButton: {
    minWidth: tapMin,
    minHeight: tapMin,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.none,
    borderColor: colors.transparent,
    borderRadius: radii.none,
    backgroundColor: colors.transparent,
  },
});
