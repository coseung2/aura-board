import { useEffect } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { ApiError, parentApiFetch } from "../lib/api";
import {
  clearParentSession,
  getUnifiedLoginRoute,
  isParentLogoutInProgress,
  loadParentToken,
} from "../lib/session";

export const PARENT_SESSION_STALE_MS = 60_000;

export function useParentSessionWatchdog() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let backgroundedAt: number | null =
      AppState.currentState === "active" ? null : Date.now();
    let checkInFlight: Promise<void> | null = null;

    const check = (): Promise<void> => {
      if (cancelled || isParentLogoutInProgress()) return Promise.resolve();
      if (checkInFlight) return checkInFlight;

      let request!: Promise<void>;
      request = (async () => {
        const token = await loadParentToken();
        if (cancelled || isParentLogoutInProgress() || !token) return;
        try {
          const status = await parentApiFetch<{ state?: string }>(
            "/api/parent/session/status",
          );
          if (status.state === "anonymous") {
            if (isParentLogoutInProgress()) return;
            await clearParentSession();
            if (!cancelled && !isParentLogoutInProgress()) {
              router.replace(
                getUnifiedLoginRoute(
                  "parent",
                  "로그인이 만료되었어요. 다시 로그인해 주세요.",
                ),
              );
            }
          }
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) {
            if (isParentLogoutInProgress()) return;
            await clearParentSession();
            if (!cancelled && !isParentLogoutInProgress()) {
              router.replace(
                getUnifiedLoginRoute(
                  "parent",
                  "로그인이 만료되었어요. 다시 로그인해 주세요.",
                ),
              );
            }
          }
        }
      })().finally(() => {
        if (checkInFlight === request) checkInFlight = null;
      });
      checkInFlight = request;
      return request;
    };

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        const inactiveDuration = backgroundedAt === null
          ? 0
          : Date.now() - backgroundedAt;
        backgroundedAt = null;
        if (inactiveDuration >= PARENT_SESSION_STALE_MS) void check();
      } else if (backgroundedAt === null) {
        backgroundedAt = Date.now();
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [router]);
}
