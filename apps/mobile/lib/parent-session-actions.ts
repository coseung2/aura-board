import { parentApiFetch } from "./api";
import {
  clearAllMobileSessions,
  loadParentToken,
  startParentLogout,
} from "./session";
import { unregisterParentPushNotifications } from "./parent-push-notifications";

export async function logoutParentSession(
  onLogoutStarted?: () => void,
): Promise<void> {
  // Stop in-flight parent guards from racing the single login destination.
  startParentLogout();
  const tokenPromise = loadParentToken().catch(() => null);
  onLogoutStarted?.();
  const token = await tokenPromise;
  await clearAllMobileSessions();

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  void Promise.allSettled([
    unregisterParentPushNotifications(token),
    parentApiFetch("/api/parent/logout", {
      method: "POST",
      headers,
      skipAuth: true,
    }),
  ]);
}
