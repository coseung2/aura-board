import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { apiFetch } from "./api";
import { loadSessionToken } from "./session";
import type { StudentNotificationPayload } from "./types";

const PUSH_TOKEN_KEY = "aura_student_expo_push_token";
export const STUDENT_NOTIFICATION_STALE_MS = 60_000;
let currentToken: string | null = null;
let handlerConfigured = false;
let lastHandledResponseId: string | null = null;
let notificationCountCache: { count: number; fetchedAt: number } | null = null;
let notificationCountInFlight: Promise<StudentNotificationPayload> | null = null;

type RemovableSubscription = { remove: () => void };
type ForegroundNotificationListener = () => void;

const foregroundNotificationListeners = new Map<ForegroundNotificationListener, number>();
let foregroundNotificationSubscription: RemovableSubscription | null = null;
let foregroundNotificationSetup: Promise<void> | null = null;

export function isStudentNotificationCountStale(now = Date.now()): boolean {
  return (
    notificationCountCache === null ||
    now - notificationCountCache.fetchedAt >= STUDENT_NOTIFICATION_STALE_MS
  );
}

export function getStudentNotificationCount(
  options: { force?: boolean } = {},
): Promise<number> {
  if (!options.force && notificationCountCache && !isStudentNotificationCountStale()) {
    return Promise.resolve(notificationCountCache.count);
  }
  if (notificationCountInFlight) {
    return notificationCountInFlight.then((payload) => payload.count);
  }

  let request!: Promise<StudentNotificationPayload>;
  request = apiFetch<StudentNotificationPayload>("/api/student/notifications")
    .then((payload) => {
      notificationCountCache = {
        count: payload.count,
        fetchedAt: Date.now(),
      };
      return payload;
    })
    .finally(() => {
      if (notificationCountInFlight === request) notificationCountInFlight = null;
    });
  notificationCountInFlight = request;
  return request.then((payload) => payload.count);
}

export function clearStudentNotificationCountCache(): void {
  notificationCountCache = null;
}

async function ensureForegroundNotificationListener(): Promise<void> {
  if (foregroundNotificationSubscription || foregroundNotificationSetup) return;

  const setup = (async () => {
    const modules = await loadNativePushModules();
    if (!modules || foregroundNotificationListeners.size === 0) return;
    const subscription = modules.Notifications.addNotificationReceivedListener(() => {
      clearStudentNotificationCountCache();
      for (const listener of foregroundNotificationListeners.keys()) {
        try {
          listener();
        } catch {
          // One badge listener must not prevent the remaining listeners from refreshing.
        }
      }
    });
    if (foregroundNotificationListeners.size === 0) {
      subscription.remove();
      return;
    }
    foregroundNotificationSubscription = subscription;
  })().catch(() => undefined);
  foregroundNotificationSetup = setup;
  await setup;
  if (foregroundNotificationSetup === setup) foregroundNotificationSetup = null;
}

export function subscribeStudentPushForeground(
  listener: ForegroundNotificationListener,
): () => void {
  foregroundNotificationListeners.set(
    listener,
    (foregroundNotificationListeners.get(listener) ?? 0) + 1,
  );
  void ensureForegroundNotificationListener();

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    const count = foregroundNotificationListeners.get(listener);
    if (!count) return;
    if (count === 1) foregroundNotificationListeners.delete(listener);
    else foregroundNotificationListeners.set(listener, count - 1);
    if (foregroundNotificationListeners.size !== 0) return;
    const subscription = foregroundNotificationSubscription;
    foregroundNotificationSubscription = null;
    try {
      subscription?.remove();
    } catch {
      // Notification cleanup should never make screen unmount fail.
    }
  };
}

async function loadNativePushModules() {
  if (Platform.OS === "web" || Constants.executionEnvironment === "storeClient") {
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

export async function registerStudentPushNotifications(): Promise<void> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return;
  if (!(await loadSessionToken())) return;

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
      console.warn("[student-push] EAS projectId is missing");
      return;
    }
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    currentToken = result.data;
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, currentToken);
    await apiFetch("/api/student/push-token", {
      method: "POST",
      json: { token: currentToken, platform: Platform.OS },
    });
  } catch (error) {
    console.warn("[student-push] registration failed", error);
  }
}

export async function unregisterStudentPushNotifications(
  authorizationToken?: string | null,
): Promise<void> {
  clearStudentNotificationCountCache();
  if (Platform.OS !== "android" && Platform.OS !== "ios") return;
  const token = currentToken ?? (await SecureStore.getItemAsync(PUSH_TOKEN_KEY));
  if (!token) return;
  currentToken = null;
  await apiFetch("/api/student/push-token", {
    method: "DELETE",
    json: { token },
    headers: authorizationToken
      ? { Authorization: `Bearer ${authorizationToken}` }
      : undefined,
    skipAuth: Boolean(authorizationToken),
  }).catch(() => undefined);
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY).catch(() => undefined);
}

export async function subscribeStudentPushNavigation(
  onHref: (href: string) => void,
): Promise<() => void> {
  const modules = await loadNativePushModules();
  if (!modules) return () => undefined;
  const { Notifications } = modules;
  const handle = (response: Awaited<ReturnType<typeof Notifications.getLastNotificationResponseAsync>>) => {
    const responseId = response?.notification.request.identifier ?? null;
    if (responseId && responseId === lastHandledResponseId) return;
    const data = response?.notification.request.content.data;
    if (data?.type === "student_notification" && typeof data.href === "string") {
      lastHandledResponseId = responseId;
      onHref(data.href);
    }
  };
  handle(await Notifications.getLastNotificationResponseAsync());
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}
