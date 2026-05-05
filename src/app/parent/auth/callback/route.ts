import { NextResponse } from "next/server";
import { verifyMagicLink } from "@/lib/parent-magic-link";
import { createParentSession } from "@/lib/parent-session";
import { db } from "@/lib/db";
import { extractClientIp, hashIp } from "@/lib/parent-rate-limit";

// GET /parent/auth/callback?token=<magic-link>
// Verifies the HMAC-signed magic link, creates a ParentSession, sets the
// HttpOnly cookie, and redirects to /parent/home.
//
// Failure modes redirect to /parent/join with ?error=invalid_link. No
// information leakage about why the token failed.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const origin = url.origin;

  const fail = (reason: string) => {
    const back = new URL("/parent/join", origin);
    back.searchParams.set("error", reason);
    return NextResponse.redirect(back.toString());
  };

  if (!token) return fail("invalid_link");

  const payload = verifyMagicLink(token);
  if (!payload) return fail("invalid_link");

  // Confirm the parent still exists + is not soft-deleted.
  const parent = await db.parent.findUnique({ where: { id: payload.parentId } });
  if (!parent || parent.parentDeletedAt) return fail("invalid_link");

  const ua = req.headers.get("user-agent") ?? null;
  const ipHash = hashIp(extractClientIp(req));

  try {
    await createParentSession({
      parentId: parent.id,
      userAgent: ua?.slice(0, 500) ?? null,
      ipHash,
    });
  } catch (e) {
    console.error("[GET /parent/auth/callback] session create", e);
    return fail("internal");
  }

  // parent-class-invite-v2 — route by current link state. Active and pending
  // links both land on the dashboard so parents can see what is happening.
  const links = await db.parentChildLink.findMany({
    where: { parentId: parent.id, deletedAt: null },
    select: { status: true },
  });
  let next = "/parent/onboard/match/code";
  if (links.some((l) => l.status === "active")) next = "/parent/home";
  else if (links.some((l) => l.status === "pending")) next = "/parent/home";
  else if (links.some((l) => l.status === "rejected")) next = "/parent/onboard/rejected";

  return NextResponse.redirect(new URL(next, origin).toString());
}
