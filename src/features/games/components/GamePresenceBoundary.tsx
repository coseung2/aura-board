"use client";

import type { ReactNode } from "react";
import type { OfficialGameKind } from "@/lib/game-platform/contracts";
import type { GamePresenceScopeKind } from "@/lib/game-platform/presence";
import { useGamePresence } from "../hooks/useGamePresence";

/**
 * Tracks only ephemeral screen presence. Game-specific join/ready/match commands
 * remain authoritative and intentionally live outside this boundary.
 */
export function GamePresenceBoundary({
  gameKind,
  scopeId,
  scopeKind = "board",
  student,
  children,
}: {
  gameKind: OfficialGameKind;
  scopeId: string;
  scopeKind?: GamePresenceScopeKind;
  student: { id: string; name: string };
  children: ReactNode;
}) {
  useGamePresence({
    gameKind,
    scopeId,
    scopeKind,
    self: { studentId: student.id, name: student.name },
  });
  return <>{children}</>;
}
