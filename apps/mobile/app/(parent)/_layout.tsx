import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
import { colors } from "../../theme/tokens";
import { useParentSessionWatchdog } from "../../hooks/use-parent-session-watchdog";
import { DailyBannerProvider } from "../../components/DailyBanner";

// Parent segment 전체 공통 layout.
export default function ParentLayout() {
  useParentSessionWatchdog();

  return (
    <View style={styles.shell}>
      <DailyBannerProvider role="parent">
        <View style={styles.stack}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: "fade",
            }}
          />
        </View>
      </DailyBannerProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg },
  stack: { flex: 1 },
});
