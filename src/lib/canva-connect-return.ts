"use client";

function currentReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  const value = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (!value || value === "/" || value === "/landing") return null;
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export function buildCanvaConnectUrl(): string {
  const returnTo = currentReturnTo();
  if (!returnTo) return "/api/auth/canva";
  return `/api/auth/canva?returnTo=${encodeURIComponent(returnTo)}`;
}
