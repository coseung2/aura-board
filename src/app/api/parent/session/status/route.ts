import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentParent } from "@/lib/parent-session";
import { findParentRoleByEmail } from "@/lib/role-switch";

// parent-class-invite-v2 — GET /api/parent/session/status.
// Returns the parent's onboarding state for client-side routing decisions.
// api_contract.json §2.1 #7. architecture.md §5.1.
//
// state priority: active > pending > rejected > revoked > authed_prematch > anonymous
// activeLinks/pendingLinks are scalar counts for the home page / inbox badges.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SessionState =
  | "anonymous"
  | "authed_prematch"
  | "pending"
  | "active"
  | "rejected"
  | "revoked";

export async function GET(_req: Request) {
  const [current, teacher] = await Promise.all([
    getCurrentParent(),
    getCurrentUser().catch(() => null),
  ]);
  const canSwitchToParent = teacher
    ? Boolean(await findParentRoleByEmail(teacher.email))
    : false;
  if (!current) {
    return NextResponse.json({
      state: "anonymous" satisfies SessionState,
      activeLinks: 0,
      pendingLinks: 0,
      rejectedReason: null,
      canSwitchToParent,
    });
  }

  const links = await db.parentChildLink.findMany({
    where: { parentId: current.parent.id, deletedAt: null },
    orderBy: { requestedAt: "desc" },
    select: { status: true, rejectedReason: true, requestedAt: true },
  });

  const activeLinks = links.filter((l) => l.status === "active").length;
  const pendingLinks = links.filter((l) => l.status === "pending").length;
  const hasRejected = links.find((l) => l.status === "rejected");
  const hasRevoked = links.find((l) => l.status === "revoked");

  let state: SessionState = "authed_prematch";
  let rejectedReason: string | null = null;
  if (activeLinks > 0) state = "active";
  else if (pendingLinks > 0) state = "pending";
  else if (hasRejected) {
    state = "rejected";
    rejectedReason = hasRejected.rejectedReason;
  } else if (hasRevoked) state = "revoked";

  return NextResponse.json({
    state,
    activeLinks,
    pendingLinks,
    rejectedReason,
    canSwitchToParent,
  });
}
