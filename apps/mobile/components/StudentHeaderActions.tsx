import { useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { LogOut } from "lucide-react-native";
import { apiFetch } from "../lib/api";
import {
  clearAllMobileSessions,
  getUnifiedLoginRoute,
  loadSessionToken,
  startStudentLogout,
} from "../lib/session";
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
      // Mark the transition and leave the authenticated stack immediately.
      // The login route suppresses restoration while local cleanup finishes.
      startStudentLogout();
      const tokenPromise = loadSessionToken().catch(() => null);
      router.replace(getUnifiedLoginRoute("student"));

      const token = await tokenPromise;
      await clearAllMobileSessions();

      // Use the captured old token so delayed cleanup can never target a new
      // session created from the login screen.
      void apiFetch("/api/student/logout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        skipAuth: true,
      }).catch(() => undefined);
    } finally {
      loggingOutRef.current = false;
      setLoggingOut(false);
    }
  }

  function confirmLogout() {
    if (loggingOutRef.current) return;
    Alert.alert(
      "로그아웃할까요?",
      "현재 계정에서 나가고 로그인 화면으로 돌아갑니다.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "로그아웃",
          style: "destructive",
          onPress: () => void handleLogout(),
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <StudentNotificationButton />
      <ControlPressable
        style={styles.logoutButton}
        onPress={confirmLogout}
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
