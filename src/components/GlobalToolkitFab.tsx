"use client";

import { usePathname } from "next/navigation";
import { BoardToolkitFab } from "./BoardTimerFab";

const HIDDEN_TOOLKIT_PATHS = new Set([
  "/",
  "/landing",
  "/login",
  "/privacy",
  "/terms",
  "/support",
]);

export function GlobalToolkitFab() {
  const pathname = usePathname();
  if (HIDDEN_TOOLKIT_PATHS.has(pathname)) {
    return null;
  }

  return <BoardToolkitFab />;
}
