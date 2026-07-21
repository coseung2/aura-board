import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, LogOut, UserPlus } from "lucide-react-native";
import { colors, iconSizes, radii, spacing } from "../theme/tokens";
import { logoutParentSession } from "../lib/parent-session-actions";
import { IconButton } from "./ui";

type Props = { notificationCount?: number };

/** Shared parent header actions, kept identical across the feed and home screens. */
export function ParentHeaderActions({ notificationCount = 0 }: Props) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logoutParentSession();
      router.replace("/?role=parent");
    } catch {
      setLoggingOut(false);
      Alert.alert(
        "로그아웃 실패",
        "로그아웃에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.",
      );
    }
  };

  const confirmLogout = () => {
    if (loggingOut) return;
    Alert.alert("로그아웃", "이 기기에서 로그아웃하시겠어요?", [
      { text: "취소", style: "cancel" },
      { text: "로그아웃", onPress: () => void handleLogout() },
    ]);
  };

  return (
    <View style={styles.actions}>
      <IconButton
        onPress={() => router.push("/(parent)/link-child")}
        accessibilityLabel="자녀 추가"
      >
        <UserPlus
          size={iconSizes.md}
          color={colors.textMuted}
          strokeWidth={2}
          accessible={false}
        />
      </IconButton>
      <IconButton
        onPress={() => router.push("/(parent)/notifications")}
        accessibilityLabel={
          notificationCount > 0 ? `알림 ${notificationCount}건` : "알림 보기"
        }
      >
        <Bell
          size={iconSizes.md}
          color={colors.textMuted}
          strokeWidth={2}
          accessible={false}
        />
        {notificationCount > 0 ? <View style={styles.notificationDot} /> : null}
      </IconButton>
      <IconButton
        onPress={confirmLogout}
        disabled={loggingOut}
        accessibilityLabel="로그아웃"
      >
        <LogOut
          size={iconSizes.md}
          color={colors.textMuted}
          strokeWidth={2}
          accessible={false}
        />
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  notificationDot: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.danger,
  },
});
