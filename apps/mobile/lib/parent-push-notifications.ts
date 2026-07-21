import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { parentApiFetch } from "./api";
import { loadParentToken } from "./session";

const PUSH_TOKEN_KEY = "aura_parent_expo_push_token";
let currentToken: string | null = null;
let handlerConfigured = false;

async function loadNativePushModules() {
  if (
    Platform.OS === "web" ||
    Constants.executionEnvironment === "storeClient"
  ) {
    return null;
  }
  const [Device, Notifications] = await Promise.all([
    import("expo-device"),
    import("expo-notifications"),
  ]);
  if (!handlerConfigured) {
    handlerConfigured = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
  return { Device, Notifications };
}

export async function registerParentPushNotifications(): Promise<void> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return;
  if (!(await loadParentToken())) return;

  try {
    const modules = await loadNativePushModules();
    if (!modules || !modules.Device.isDevice) return;
    const { Notifications } = modules;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Aura Board 알림",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    const permission = existing.granted
      ? existing
      : await Notifications.requestPermissionsAsync();
    if (!permission.granted) return;

    const projectId =
      Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn("[parent-push] EAS projectId is missing");
      return;
    }
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    currentToken = result.data;
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, currentToken);
    await parentApiFetch("/api/parent/push-token", {
      method: "POST",
      json: { token: currentToken, platform: Platform.OS },
    });
  } catch (error) {
    console.warn("[parent-push] registration failed", error);
  }
}

export async function unregisterParentPushNotifications(): Promise<void> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return;
  const token = currentToken ?? (await SecureStore.getItemAsync(PUSH_TOKEN_KEY));
  if (!token) return;
  currentToken = null;
  await parentApiFetch("/api/parent/push-token", {
    method: "DELETE",
    json: { token },
  }).catch(() => undefined);
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY).catch(() => undefined);
}
