import { Stack, useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../../theme/tokens";
import { useParentSessionWatchdog } from "../../hooks/use-parent-session-watchdog";
import { DailyBannerProvider } from "../../components/DailyBanner";
import { WalkingPermissionOnboarding } from "../../components/WalkingPermissionOnboarding";
import { subscribeParentPushNavigation } from "../../lib/parent-push-notifications";

// Parent segment 전체 공통 layout.
export default function ParentLayout() {
  const router = useRouter();
  useParentSessionWatchdog();

  useEffect(() => {
    let unsubscribe: () => void = () => undefined;
    void subscribeParentPushNavigation((href) => {
      router.push(href as Href);
    }).then((next) => {
      unsubscribe = next;
    });
    return () => unsubscribe();
  }, [router]);

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
      <WalkingPermissionOnboarding accountKey="parent" role="parent" />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg },
  stack: { flex: 1 },
});
