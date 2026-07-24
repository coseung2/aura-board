import { parentApiFetch } from "./api";
import { clearParentSession, startParentLogout } from "./session";
import { unregisterParentPushNotifications } from "./parent-push-notifications";

export async function logoutParentSession(
  onLogoutStarted?: () => void,
): Promise<void> {
  // Stop in-flight parent guards from racing the single login destination.
  startParentLogout();
  onLogoutStarted?.();
  await unregisterParentPushNotifications().catch(() => undefined);
  await parentApiFetch("/api/parent/logout", { method: "POST" }).catch(
    () => undefined,
  );
  await clearParentSession();
}
