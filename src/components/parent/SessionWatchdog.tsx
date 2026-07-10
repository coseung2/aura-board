"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// PV-9 — parent client watchdog.
//
// Polls /api/parent/session/status every 45 seconds. If the response is 401
// (teacher revoke happened, or session expired), we redirect to
// /parent/logged-out. We don't clear the cookie client-side (it's HttpOnly)
// — the server invalidated it on revoke, and future requests will keep
// returning 401 until the user visits /parent/join.
//
// 45s polling interval was chosen so worst-case revoke latency stays under
// the 60s SLA (AC-7) even accounting for the user being on a stale tab.
//
// This runs globally under the (app) layout; once mounted, it follows the
// user across client-side navigations because the layout persists.

const POLL_MS = 45_000;

export function SessionWatchdog() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/parent/session/status", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const payload: { state?: string } | null = res.ok
          ? await res.json().catch(() => null)
          : null;
        if (res.status === 401 || payload?.state === "anonymous") {
          if (!cancelled) router.replace("/parent/logged-out");
          return;
        }
        // 200 — keep polling. Other statuses (500 etc.) we ignore so a
        // brief server blip doesn't boot the user.
      } catch {
        // Network error — stay optimistic, try again next tick.
      }
      if (!cancelled) {
        timer = setTimeout(tick, POLL_MS);
      }
    };

    // Kick off the first tick after a small delay so the initial page load
    // isn't racing with the auth check.
    timer = setTimeout(tick, POLL_MS);

    // Also listen for the "fetch returned 401" event that other components
    // can dispatch (see parent-fetch.ts). This gives us sub-45s latency
    // whenever the user actively navigates/interacts after a revoke.
    const onAuthLost = () => {
      if (!cancelled) router.replace("/parent/logged-out");
    };
    window.addEventListener("parent-auth-lost", onAuthLost);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("parent-auth-lost", onAuthLost);
    };
  }, [router]);

  return null;
}
