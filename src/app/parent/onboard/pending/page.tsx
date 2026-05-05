"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingShell } from "../_shell";

// parent-class-invite-v2 — legacy P5 Pending URL.
// Pending state now lives inside /parent/home so the bottom nav and dashboard
// remain visible.

export default function PendingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>("pending");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch("/api/parent/session/status");
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        setStatus(j.state);
        if (j.state === "active" || j.state === "pending") {
          router.replace("/parent/home");
        } else if (j.state === "rejected") {
          router.push(`/parent/onboard/rejected?reason=${encodeURIComponent(j.rejectedReason ?? "other")}`);
        } else if (j.state === "anonymous" || j.state === "authed_prematch") {
          router.push("/parent/onboard/signup");
        }
      } catch (e) {
        setErr((e as Error).message);
      }
    };
    poll();
    const int = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(int);
    };
  }, [router]);

  return (
    <OnboardingShell step={4} total={4}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>⏳</div>
        <h1 style={{ margin: "12px 0 8px", fontSize: 22, fontWeight: 700 }}>승인 대기 중</h1>
        <p style={{ margin: 0, fontSize: 15, color: "var(--color-text-muted)", lineHeight: 1.6 }}>
          선생님이 승인하면 자녀 보드를 볼 수 있습니다. 보통 1~3일 소요됩니다.
          7일 내 미승인 시 자동 만료됩니다.
        </p>
        {status === "active" && (
          <p style={{ marginTop: 16, color: "var(--color-accent)", fontWeight: 600 }}>
            승인되었습니다. 잠시 후 이동합니다...
          </p>
        )}
        {err && <p style={{ marginTop: 16, color: "var(--color-danger)", fontSize: 13 }}>{err}</p>}
      </div>
    </OnboardingShell>
  );
}
