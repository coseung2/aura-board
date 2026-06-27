import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentParent } from "@/lib/parent-session";
import { ParentTopNav } from "@/components/parent/ParentTopNav";
import { SessionWatchdog } from "@/components/parent/SessionWatchdog";

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
  return (
    <>
      <ParentTopNav parent={{ name: parent.name, email: parent.email }} />
      {children}
      <SessionWatchdog />
    </>
  );
}
