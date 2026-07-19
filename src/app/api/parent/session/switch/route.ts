import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  clearParentSession,
  createParentSession,
  getCurrentParent,
} from "@/lib/parent-session";
import { isSameAccountPrincipal } from "@/lib/account-principal";
import { findParentRoleByEmail } from "@/lib/role-switch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Switch a signed-in teacher into their matching parent role without another
 * OAuth round trip. The parent role must belong to the same email account.
 */
export async function POST(req: Request) {
  const teacher = await getCurrentUser().catch(() => null);
  if (!teacher) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parent = await findParentRoleByEmail(teacher.email);
  if (!parent || !isSameAccountPrincipal(teacher.email, parent.email)) {
    return NextResponse.json({ error: "parent_role_not_found" }, { status: 404 });
  }

  const currentParent = await getCurrentParent();
  if (currentParent && currentParent.parent.id !== parent.id) {
    await clearParentSession();
  }

  if (!currentParent || currentParent.parent.id !== parent.id) {
    await createParentSession({
      parentId: parent.id,
      userAgent: req.headers.get("user-agent") ?? null,
      ipHash: null,
    });
  }

  return NextResponse.json({ redirect: "/parent/feed" });
}
