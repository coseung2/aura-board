"use client";

import { useEffect, useState } from "react";
import { CanvaAttribution } from "@/components/canva/CanvaAttribution";

/**
 * /student/logout — clears the top-level student_session cookie via
 * POST /api/student/logout, then auto-closes the tab. Used as the
 * top-level popup target from the Canva App panel (see src/app.tsx
 * handleLogout) so the logout runs in the real aura-board cookie jar
 * rather than the iframe's partitioned jar.
 *
 * Implemented as a client component because Next.js 15 no longer allows
 * mutating cookies from a server page render; cookie deletion must go
 * through a Route Handler / Server Action.
 */
export default function StudentLogoutPage() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/student/logout", { method: "POST" });
      } catch {
        // ignore — show completion anyway so user closes the tab
      }
      if (!cancelled) setDone(true);
      setTimeout(() => {
        try {
          window.close();
        } catch {
          /* popup blockers may prevent this */
        }
      }, 800);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        flexDirection: "column",
        gap: 12,
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>
        {done ? "로그아웃되었습니다" : "로그아웃 중…"}
      </h1>
      <p style={{ color: "#666" }}>이 창을 닫으면 앱으로 돌아갑니다.</p>
      <CanvaAttribution />
    </div>
  );
}
