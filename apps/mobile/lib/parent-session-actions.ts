import { parentApiFetch } from "./api";
import { clearParentSession } from "./session";
import { unregisterParentPushNotifications } from "./parent-push-notifications";

export async function logoutParentSession(): Promise<void> {
  await unregisterParentPushNotifications().catch(() => undefined);
  await parentApiFetch("/api/parent/logout", { method: "POST" }).catch(
    () => undefined,
  );
  await clearParentSession();
}
