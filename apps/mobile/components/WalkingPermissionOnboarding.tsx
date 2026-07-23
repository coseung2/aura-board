import { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  getGrantedHealthConnectPermissions,
  getHealthConnectStatus,
  hasRequiredHealthConnectPermissions,
  isWalkingHealthModuleAvailable,
  openHealthConnectSettings,
  requestHealthConnectPermissions,
} from "../lib/walking-health";
import { colors, spacing, typography } from "../theme/tokens";
import { AppButton, AppModal } from "./ui";

type Props = {
  studentId: string;
};

const promptKey = (studentId: string) => `aura_walk_permission_intro_v1_${studentId}`;

export function WalkingPermissionOnboarding({ studentId }: Props) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const dismiss = useCallback(async () => {
    // Close the modal immediately. SecureStore can be slow on Android after
    // the Health Connect activity returns, and awaiting it keeps the button in
    // its loading state even though permission setup already succeeded.
    setVisible(false);
    await SecureStore.setItemAsync(promptKey(studentId), "shown").catch(() => undefined);
  }, [studentId]);

  useEffect(() => {
    let active = true;

    async function checkPermissionSetup() {
      if (
        (Platform.OS !== "android" && Platform.OS !== "ios") ||
        !isWalkingHealthModuleAvailable()
      ) return;

      const seen = await SecureStore.getItemAsync(promptKey(studentId)).catch(() => "shown");
      if (seen || !active) return;

      try {
        const status = await getHealthConnectStatus();
        if (!active || status === "unavailable") return;
        if (status === "needs_update") {
          setNeedsUpdate(true);
          setVisible(true);
          return;
        }

        const permissions = await getGrantedHealthConnectPermissions();
        if (!active || hasRequiredHealthConnectPermissions(permissions)) return;
        setVisible(true);
      } catch {
        // 권한 안내는 걷기 화면에서도 다시 제공하므로, 시작 흐름을 막지 않는다.
      }
    }

    void checkPermissionSetup();
    return () => {
      active = false;
    };
  }, [studentId]);

  const connect = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (needsUpdate) {
        await openHealthConnectSettings();
        await dismiss();
        return;
      }

      const permissions = await requestHealthConnectPermissions();
      if (!hasRequiredHealthConnectPermissions(permissions)) {
        setMessage("걸음 수 권한을 허용해 주세요.");
        return;
      }
      await dismiss();
    } catch {
      setMessage(
        needsUpdate
          ? "Health Connect 업데이트 화면을 열지 못했어요. 걷기 탭에서 다시 시도해 주세요."
          : "권한 연결을 완료하지 못했어요. 걷기 탭에서 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }, [dismiss, needsUpdate]);

  return (
    <AppModal
      visible={visible}
      onClose={() => void dismiss()}
      closeOnBackdropPress
      accessibilityLabel="걸음 수 권한 안내"
      sheetStyle={styles.sheet}
    >
      <Text style={styles.title}>
        {needsUpdate ? "Health Connect를 업데이트해요" : "걸음 수를 자동으로 기록할까요?"}
      </Text>
      <Text style={styles.description}>
        {needsUpdate
          ? "걸음 수를 불러오려면 Health Connect 업데이트가 필요해요."
          : "날짜별 걸음 수 합계만 읽어요."}
      </Text>
      {!needsUpdate ? (
        <View style={styles.facts}>
          <Text style={styles.fact}>필요한 권한: 걸음 수</Text>
          <Text style={styles.fact}>읽지 않는 정보: 위치, 이동 경로</Text>
          <Text style={styles.fact}>권한은 언제든 Health Connect 설정에서 바꿀 수 있어요.</Text>
        </View>
      ) : null}
      {message ? <Text style={styles.error}>{message}</Text> : null}
      <View style={styles.actions}>
        <AppButton
          variant="secondary"
          style={styles.action}
          textStyle={styles.deferText}
          onPress={() => void dismiss()}
          disabled={busy}
        >
          나중에
        </AppButton>
        <AppButton style={styles.action} onPress={() => void connect()} loading={busy}>
          {needsUpdate ? "업데이트하기" : "권한 연결"}
        </AppButton>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.text },
  description: { ...typography.body, color: colors.textMuted },
  facts: { gap: spacing.xs, paddingVertical: spacing.xs },
  fact: { ...typography.label, color: colors.text },
  error: { ...typography.label, color: colors.danger },
  actions: { flexDirection: "row", gap: spacing.md },
  action: { flex: 1 },
  deferText: { ...typography.label, color: colors.textMuted },
});
