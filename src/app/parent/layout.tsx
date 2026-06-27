import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

// Parent PWA shell layout (PV-6).
//
// - Injects mobile-first viewport with `maximum-scale=1` to keep the parent
//   app shell stable in standalone/mobile Safari.
// - Registers `parent-manifest.json` scoped to `/parent/` so the home screen
//   install prompt only fires inside the parent flow (doesn't affect teacher UX).
// - Adds theme-color meta for standalone mode (matches manifest primary).
// - Session guard is *not* done here — each page calls `getCurrentParent()` or
//   a scope helper explicitly so we can differentiate 401 vs missing-cookie
//   redirects per route.
//
// Authenticated parent navigation is mounted by /parent/(app)/layout.tsx.

export const metadata: Metadata = {
  title: "Aura-board 학부모",
  description: "자녀의 교실 활동을 읽기 전용으로 확인합니다.",
  manifest: "/parent-manifest.json",
  other: {
    "theme-color": "#4f46e5",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#4f46e5",
};

export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--color-surface-muted, #f9fafb)",
      }}
    >
      {children}
    </div>
  );
}
