import { useEffect } from "react";
import { AppState } from "react-native";
import { useRouter } from "expo-router";
import { ApiError, parentApiFetch } from "../lib/api";
import { clearParentSession, loadParentToken } from "../lib/session";

const POLL_MS = 45_000;

export function useParentSessionWatchdog() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (cancelled || !(await loadParentToken())) return;
      try {
        const status = await parentApiFetch<{ state?: string }>(
          "/api/parent/session/status",
        );
        if (status.state === "anonymous") {
          await clearParentSession();
          if (!cancelled) {
            router.replace(
              "/(parent)/login?error=로그인이 만료되었어요. 다시 로그인해 주세요.",
            );
          }
        }
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          await clearParentSession();
          if (!cancelled) {
            router.replace(
              "/(parent)/login?error=로그인이 만료되었어요. 다시 로그인해 주세요.",
            );
          }
        }
      }
    };

    const timer = setInterval(() => void check(), POLL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, [router]);
}
