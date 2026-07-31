import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Linking from "expo-linking";
import { apiFetch } from "../lib/api";
import {
  getMobileUpdateKind,
  normalizeInstalledVersion,
  parseMobileVersionPolicy,
  type MobileUpdateKind,
  type MobileVersionPolicy,
} from "../lib/mobile-update-policy";
import { colors, composer, radii, spacing, typography } from "../theme/tokens";
import { AppButton, AppModal } from "./ui";

const VERSION_POLICY_TIMEOUT_MS = 8000;

type UpdatePrompt = {
  kind: MobileUpdateKind;
  policy: MobileVersionPolicy;
};

export function MobileUpdateGate({ children }: { children: ReactNode }) {
  const installedVersion = normalizeInstalledVersion(
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
      ? Constants.expoConfig?.version
      : Constants.nativeAppVersion ?? Constants.expoConfig?.version,
  );
  const [prompt, setPrompt] = useState<UpdatePrompt | null>(null);
  const [openingStore, setOpeningStore] = useState(false);
  const requestRef = useRef<Promise<void> | null>(null);
  const optionalPromptShownRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    let mounted = true;

    const applyPolicy = (policy: MobileVersionPolicy) => {
      if (!mounted) return;
      const kind = getMobileUpdateKind(installedVersion, policy);
      if (!kind) {
        setPrompt(null);
        return;
      }
      if (kind === "optional") {
        if (optionalPromptShownRef.current) return;
        optionalPromptShownRef.current = true;
      }
      setPrompt({ kind, policy });
    };

    const checkPolicy = () => {
      if (requestRef.current) return requestRef.current;

      let request: Promise<void>;
      request = apiFetch<unknown>("/api/mobile/version-policy", {
        skipAuth: true,
        timeoutMs: VERSION_POLICY_TIMEOUT_MS,
      })
        .then((payload) => {
          const policy = parseMobileVersionPolicy(payload);
          if (policy) applyPolicy(policy);
        })
        .catch(() => {
          // The update check is best-effort and must never block app startup.
        })
        .finally(() => {
          if (requestRef.current === request) requestRef.current = null;
        });

      requestRef.current = request;
      return request;
    };

    void checkPolicy();

    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState !== "active" || previousState === "active") return;

      optionalPromptShownRef.current = false;
      void checkPolicy();
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [installedVersion]);

  async function openStore() {
    if (!prompt) return;

    setOpeningStore(true);
    const storeUrl = Platform.OS === "ios" ? prompt.policy.storeUrls.ios : prompt.policy.storeUrls.android;
    try {
      await Linking.openURL(storeUrl);
      setPrompt(null);
    } catch {
      Alert.alert(
        "업데이트 안내",
        "앱 스토어를 열 수 없어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setOpeningStore(false);
    }
  }

  const dismissOptional = () => {
    if (prompt?.kind === "optional") setPrompt(null);
  };

  return (
    <>
      {children}
      <AppModal
        visible={prompt !== null}
        onClose={prompt?.kind === "required" ? () => undefined : dismissOptional}
        accessibilityLabel={
          prompt?.kind === "required" ? "필수 업데이트 안내" : "업데이트 안내"
        }
        sheetStyle={styles.modalSheet}
      >
        {prompt ? (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text accessibilityRole="header" style={styles.title}>
              {prompt.kind === "required"
                ? "업데이트가 필요해요"
                : "새 버전이 있어요"}
            </Text>
            <Text style={styles.message}>{prompt.policy.message}</Text>
            <View style={styles.versionSummary} accessible accessibilityRole="summary">
              <Text style={styles.versionText}>
                현재 버전 {installedVersion} · 최신 버전 {prompt.policy.latestVersion}
              </Text>
            </View>
            <View style={styles.actions}>
              {prompt.kind === "optional" ? (
                <AppButton
                  variant="secondary"
                  style={styles.action}
                  onPress={dismissOptional}
                  accessibilityLabel="나중에 업데이트하기"
                >
                  나중에
                </AppButton>
              ) : null}
              <AppButton
                style={styles.action}
                onPress={() => void openStore()}
                loading={openingStore}
                accessibilityLabel="업데이트 열기"
              >
                업데이트
              </AppButton>
            </View>
          </ScrollView>
        ) : null}
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  modalSheet: {
    maxWidth: composer.sheetMaxWidth,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.xl,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
  },
  versionSummary: {
    gap: spacing.xs,
    borderRadius: radii.control,
    backgroundColor: colors.accentTintedBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  versionText: {
    ...typography.label,
    color: colors.accentTintedText,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
