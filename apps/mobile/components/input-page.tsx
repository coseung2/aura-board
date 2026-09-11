import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, layout } from "../theme/tokens";
import { AppHeader } from "./ui";

/** The child owns scrolling; Android's window resize owns keyboard avoidance. */
export function InputPage({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.page}>
      <AppHeader title={title} onBack={onBack} showDailyBanner={false} />
      <KeyboardAvoidingView
        style={styles.keyboard}
        enabled={Platform.OS === "ios"}
        behavior="padding"
      >
        <View style={styles.body}>{children}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  keyboard: { flex: 1 },
  body: {
    flex: 1,
    width: "100%",
    maxWidth: layout.readableMaxWidth,
    alignSelf: "center",
  },
});
