import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  getGrantedHealthConnectPermissions,
  getHealthConnectStatus,
  hasRequiredHealthConnectPermissions,
  isWalkingHealthModuleAvailable,
  openHealthConnectSettings,
  requestHealthConnectPermissions,
} from "../lib/walking-health";
import AuraBoardHealthConnectModule from "../modules/aura-board-health-connect/src/AuraBoardHealthConnectModule";
import { colors, spacing, typography } from "../theme/tokens";
import { AppButton, AppModal } from "./ui";

type Props = {
  accountKey: string;
  role: "student" | "parent";
};

const promptKey = (accountKey: string) => `aura_walk_permission_intro_v2_${accountKey}`;

export function WalkingPermissionOnboarding({ accountKey, role }: Props) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const permissionRecheckRef = useRef<Promise<boolean> | null>(null);

  const dismiss = useCallback(async () => {
    // Close the modal immediately. SecureStore can be slow on Android after
    // the Health Connect activity returns, and awaiting it keeps the button in
    // its loading state even though permission setup already succeeded.
    setVisible(false);
    await SecureStore.setItemAsync(promptKey(accountKey), "shown").catch(() => undefined);
  }, [accountKey]);

  const recheckGrantedPermission = useCallback(() => {
    if (permissionRecheckRef.current) return permissionRecheckRef.current;

    const check = (async () => {
      // Health Connect can resume the app before its permission controller has
      // finished reflecting a newly granted read permission. Re-read the
      // authoritative state briefly instead of relying only on the activity
      // result payload.
      for (const delayMs of [0, 200, 500]) {
        if (delayMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        }
        const permissions = await getGrantedHealthConnectPermissions();
        if (!hasRequiredHealthConnectPermissions(permissions)) continue;
        if (Platform.OS === "ios") {
          const motionStatus = await AuraBoardHealthConnectModule?.getMotionPermissionStatus?.();
          if (motionStatus !== "authorized") continue;
        }
        await dismiss();
        return true;
      }
      return false;
    })().finally(() => {
      permissionRecheckRef.current = null;
    });

    permissionRecheckRef.current = check;
    return check;
  }, [dismiss]);

  useEffect(() => {
    let active = true;

    async function checkPermissionSetup() {
      if (
        (Platform.OS !== "android" && Platform.OS !== "ios") ||
        !isWalkingHealthModuleAvailable()
      ) return;

      const seen = await SecureStore.getItemAsync(promptKey(accountKey)).catch(() => "shown");
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
        if (!active || hasRequiredHealthConnectPermissions(permissions)) {
          if (Platform.OS !== "ios") return;

          const motionStatus = await AuraBoardHealthConnectModule?.getMotionPermissionStatus?.();
          if (!active || motionStatus === "authorized") return;
        }
        setVisible(true);
      } catch {
        // 권한 안내는 걷기 화면에서도 다시 제공하므로, 시작 흐름을 막지 않는다.
      }
    }

    void checkPermissionSetup();
    return () => {
      active = false;
    };
  }, [accountKey]);

  useEffect(() => {
    if (!visible || needsUpdate) return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      void recheckGrantedPermission().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [needsUpdate, recheckGrantedPermission, visible]);

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
      if (Platform.OS === "ios") {
        if (!AuraBoardHealthConnectModule?.requestMotionPermission) {
          throw new Error("iOS 동작 및 피트니스 권한 요청을 사용할 수 없습니다.");
        }
        await AuraBoardHealthConnectModule.requestMotionPermission();
        await dismiss();
        return;
      }
      if (
        !hasRequiredHealthConnectPermissions(permissions) &&
        !(await recheckGrantedPermission())
      ) {
        setMessage("걸음 수 권한을 허용해 주세요.");
        return;
      }
      if (hasRequiredHealthConnectPermissions(permissions)) {
        await dismiss();
      }
    } catch {
      setMessage(
        needsUpdate
          ? "Health Connect 업데이트 화면을 열지 못했어요. 걷기 탭에서 다시 시도해 주세요."
          : "권한 연결을 완료하지 못했어요. 걷기 탭에서 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }, [dismiss, needsUpdate, recheckGrantedPermission]);

  return (
    <AppModal
      visible={visible}
      onClose={() => void dismiss()}
      closeOnBackdropPress
      accessibilityLabel="걸음 수 권한 안내"
      sheetStyle={styles.sheet}
    >
      <Text style={styles.title}>
        {needsUpdate ? "Health Connect 업데이트" : "걸음 수 연결"}
      </Text>
      <View style={styles.facts}>
        {needsUpdate ? (
          <>
            <Text style={styles.fact}>상태: 업데이트 필요</Text>
            <Text style={styles.fact}>목적: 걸음 수 연동</Text>
          </>
        ) : (
          <>
            <Text style={styles.fact}>
              {Platform.OS === "ios"
                ? "권한: Apple 건강 걸음 수·동작 및 피트니스"
                : "권한: 걸음 수 읽기"}
            </Text>
            <Text style={styles.fact}>
              목적: {role === "parent" ? "내 걷기 기록·자녀 걷기 확인" : "걷기 기록·보상·학급 순위"}
            </Text>
            <Text style={styles.fact}>
              관리: {Platform.OS === "ios" ? "Apple 건강·iPhone 설정" : "Health Connect 설정"}
            </Text>
          </>
        )}
      </View>
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
          {needsUpdate ? "업데이트" : "연결"}
        </AppButton>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: spacing.xl, gap: spacing.md },
  title: { ...typography.title, color: colors.text },
  facts: { gap: spacing.xs, paddingVertical: spacing.xs },
  fact: { ...typography.label, color: colors.text },
  error: { ...typography.label, color: colors.danger },
  actions: { flexDirection: "row", gap: spacing.md },
  action: { flex: 1 },
  deferText: { ...typography.label, color: colors.textMuted },
});
