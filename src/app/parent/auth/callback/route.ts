import { NextResponse } from "next/server";
import { verifyMagicLink } from "@/lib/parent-magic-link";
import { createParentSession } from "@/lib/parent-session";
import { db } from "@/lib/db";
import { extractClientIp, hashIp } from "@/lib/parent-rate-limit";

// GET /parent/auth/callback?token=<magic-link>[&client=mobile]
// Verifies the HMAC-signed magic link, creates a ParentSession, sets the
// HttpOnly cookie, and redirects to /parent/feed.
//
// Mobile handoff (Phase 3+):
//   When `client=mobile` is present, the issued session token + expiry are
//   returned in the URL FRAGMENT of a hardcoded `auraboard://parent/auth/callback`
//   deep link — never in the query string — so the token is not transmitted
//   to any third party in the request path. The cookie side effect is kept
//   (harmless on RN), but the mobile app uses the Bearer token from the
//   fragment via expo-secure-store.
//
//   The `client` param is accepted only when it is exactly "mobile". The
//   redirect target is a hardcoded constant; the request never supplies a
//   redirect URL.
//
// Web behavior is unchanged on this route.

const MOBILE_DEEP_LINK = "auraboard://parent/auth/callback";

function mobileRedirect(params: { token?: string; expiresAt?: string; error?: string }) {
  // URL fragment (#...) is preserved by URL when set on .hash.
  const u = new URL(MOBILE_DEEP_LINK);
  if (params.error) {
    u.hash = `error=${encodeURIComponent(params.error)}`;
  } else if (params.token && params.expiresAt) {
    u.hash = `token=${encodeURIComponent(params.token)}&expiresAt=${encodeURIComponent(params.expiresAt)}`;
  }
  return NextResponse.redirect(u.toString());
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const clientParam = url.searchParams.get("client");
  const isMobile = clientParam === "mobile";
  const origin = url.origin;

  // Any other client value falls back to web so an attacker cannot steer a
  // browser into the app deep link with an arbitrary request.

  const webFail = (reason: string) => {
    const back = new URL("/parent/join", origin);
    back.searchParams.set("error", reason);
    return NextResponse.redirect(back.toString());
  };
  const fail = (reason: string) =>
    isMobile ? mobileRedirect({ error: reason }) : webFail(reason);

  if (!token) return fail("invalid_link");

  const payload = verifyMagicLink(token);
  if (!payload) return fail("invalid_link");

  // Confirm the parent still exists + is not soft-deleted.
  const parent = await db.parent.findUnique({ where: { id: payload.parentId } });
  if (!parent || parent.parentDeletedAt) return fail("invalid_link");

  const ua = req.headers.get("user-agent") ?? null;
  const ipHash = hashIp(extractClientIp(req));

  let session;
  try {
    session = await createParentSession({
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
  if (isMobile) {
    // Mobile: hand the session token back via deep link fragment, and let
    // the client decide the next screen using its own session/status call.
    return mobileRedirect({
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
    });
  }

  const links = await db.parentChildLink.findMany({
    where: { parentId: parent.id, deletedAt: null },
    select: { status: true },
  });
  let next = "/parent/onboard/match/code";
  if (links.some((l) => l.status === "active")) next = "/parent/feed";
  else if (links.some((l) => l.status === "pending")) next = "/parent/feed";
  else if (links.some((l) => l.status === "rejected")) next = "/parent/onboard/rejected";

  return NextResponse.redirect(new URL(next, origin).toString());
}
