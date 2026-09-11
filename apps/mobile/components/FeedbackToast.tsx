import { useEffect, useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SurfaceCard, TextActionPressable } from "./ui";
import { colors, spacing, typography, layers, layout } from "../theme/tokens";

type Notice = { message: string; variant?: "success" | "info" | "error"; id?: number } | null;
/** Native adapter using the existing card, text-action and typography primitives. */
export function FeedbackToast({ notice }: { notice: Notice }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(Boolean(notice));
    if (!notice) return;
    const timer = setTimeout(() => setVisible(false), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!visible || !notice) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.md }]}>
      <SurfaceCard style={styles.card}>
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.message, notice.variant === "error" && { color: colors.danger }]}>{notice.message}</Text>
        <TextActionPressable accessibilityLabel="알림 닫기" onPress={() => setVisible(false)}><Text style={styles.message}>닫기</Text></TextActionPressable>
      </SurfaceCard>
    </View>
  );
}
const styles = StyleSheet.create({
  host: { position: "absolute", left: spacing.md, right: spacing.md, zIndex: layers.toast, alignItems: "center" },
  card: { width: "100%", maxWidth: layout.toastMaxWidth, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  message: { ...typography.body, color: colors.text, flexShrink: 1 },
});
