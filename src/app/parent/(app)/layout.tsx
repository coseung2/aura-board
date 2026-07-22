import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentParent } from "@/lib/parent-session";
import { findTeacherRoleByEmail } from "@/lib/role-switch";
import { isSameAccountPrincipal } from "@/lib/account-principal";
import { ParentTopNav } from "@/components/parent/ParentTopNav";
import { SessionWatchdog } from "@/components/parent/SessionWatchdog";

// Authenticated parent segment layout (PV-6).
//
// Every page under /parent/(app)/** requires a valid ParentSession. We do the
// redirect here at the layout boundary so individual pages don't repeat the
// boilerplate. `getCurrentParent()` already returns null for revoked /
// expired / soft-deleted — all of those funnel into the canonical /login UI.
//
// The top nav is mounted here (NOT in the parent root layout) because it
// only belongs on authenticated pages, not /join or /auth.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ParentAppLayout({ children }: { children: ReactNode }) {
  const current = await getCurrentParent();
  if (!current) {
    redirect("/login?role=parent&error=session_required");
  }
  const parent = current.parent;
  const [pendingCount, teacherSessionUser, teacherRole] = await Promise.all([
    db.parentChildLink.count({
      where: {
        parentId: parent.id,
        status: "pending",
        deletedAt: null,
      },
    }),
    getCurrentUser().catch(() => null),
    findTeacherRoleByEmail(parent.email),
  ]);
  const hasMatchingTeacherSession = Boolean(
    teacherSessionUser &&
      isSameAccountPrincipal(teacherSessionUser.email, parent.email)
  );

  return (
    <>
      <ParentTopNav
        parent={{ name: parent.name, email: parent.email }}
        pendingNotificationCount={pendingCount}
        canSwitchToTeacher={Boolean(teacherRole)}
        teacherSwitchHref={hasMatchingTeacherSession ? "/dashboard" : "/login?from=/dashboard"}
      />
      <div className="parent-app-content">{children}</div>
      <SessionWatchdog />
    </>
  );
}
