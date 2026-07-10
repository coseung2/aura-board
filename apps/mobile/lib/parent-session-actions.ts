import { parentApiFetch } from "./api";
import { clearParentSession } from "./session";

export async function logoutParentSession(): Promise<void> {
  await parentApiFetch("/api/parent/logout", { method: "POST" });
  await clearParentSession();
}
