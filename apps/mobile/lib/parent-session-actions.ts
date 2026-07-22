import { parentApiFetch } from "./api";
import { clearParentSession, startParentLogout } from "./session";
import { unregisterParentPushNotifications } from "./parent-push-notifications";

export async function logoutParentSession(): Promise<void> {
  // Stop in-flight parent guards from racing the single login destination.
  startParentLogout();
  await unregisterParentPushNotifications().catch(() => undefined);
  await parentApiFetch("/api/parent/logout", { method: "POST" }).catch(
    () => undefined,
  );
  await clearParentSession();
}
