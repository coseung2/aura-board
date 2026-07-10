import { Stack } from "expo-router";
import { colors } from "../../theme/tokens";
import { useParentSessionWatchdog } from "../../hooks/use-parent-session-watchdog";

// Parent segment 전체 공통 layout.
export default function ParentLayout() {
  useParentSessionWatchdog();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: "fade",
      }}
    />
  );
}
