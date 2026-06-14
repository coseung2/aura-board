import { Stack } from "expo-router";
import { colors } from "../../theme/tokens";

// Parent segment 전체 공통 layout.
export default function ParentLayout() {
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
