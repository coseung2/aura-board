import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentParent } from "@/lib/parent-session";
import { findTeacherRoleByEmail } from "@/lib/role-switch";
import { isSameAccountPrincipal } from "@/lib/account-principal";
import { ParentTopNav } from "@/components/parent/ParentTopNav";
import { SessionWatchdog } from "@/components/parent/SessionWatchdog";
import type { ChildRow } from "@/components/parent/ParentChildSelector";

// Authenticated parent segment layout (PV-6).
//
// Every page under /parent/(app)/** requires a valid ParentSession. We do the
// redirect here at the layout boundary so individual pages don't repeat the
// boilerplate. `getCurrentParent()` already returns null for revoked /
// expired / soft-deleted — all of those funnel into /parent/logged-out.
//
// The top nav is mounted here (NOT in the parent root layout) because it
// only belongs on authenticated pages, not /join or /auth.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ParentAppLayout({ children }: { children: ReactNode }) {
  const current = await getCurrentParent();
  if (!current) {
    redirect("/parent/join?error=session_required");
  }
  const parent = current.parent;
  const [activeLinks, pendingCount, teacherSessionUser, teacherRole] = await Promise.all([
    db.parentChildLink.findMany({
      where: {
        parentId: parent.id,
        status: "active",
        deletedAt: null,
      },
      select: {
        studentId: true,
        student: {
          select: {
            name: true,
            number: true,
            classroom: { select: { name: true } },
          },
        },
      },
      orderBy: { requestedAt: "asc" },
    }),
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
  const childRows: ChildRow[] = activeLinks.map((link) => ({
    studentId: link.studentId,
    studentName: link.student.name,
    studentNumber: link.student.number,
    classroomName: link.student.classroom.name,
  }));
  const hasMatchingTeacherSession = Boolean(
    teacherSessionUser &&
      isSameAccountPrincipal(teacherSessionUser.email, parent.email)
  );

  return (
    <>
      <ParentTopNav
        parent={{ name: parent.name, email: parent.email }}
        childRows={childRows}
        pendingNotificationCount={pendingCount}
        canSwitchToTeacher={Boolean(teacherRole)}
        teacherSwitchHref={hasMatchingTeacherSession ? "/dashboard" : "/login?from=/dashboard"}
      />
      <div className="parent-app-content">{children}</div>
      <SessionWatchdog />
    </>
  );
}
