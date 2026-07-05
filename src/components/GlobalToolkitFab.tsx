"use client";

import { usePathname } from "next/navigation";
import { BoardToolkitFab } from "./BoardTimerFab";

export function GlobalToolkitFab() {
  const pathname = usePathname();
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/support"
  ) {
    return null;
  }

  return <BoardToolkitFab />;
}
