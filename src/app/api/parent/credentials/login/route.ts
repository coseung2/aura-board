import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, signOut } from "@/lib/auth-config";
import { isSameAccountPrincipal } from "@/lib/account-principal";
import { validateCredentialRequest } from "@/lib/credential-request";
import { db } from "@/lib/db";
import { verifyPasswordCredential, normalizePasswordUsername } from "@/lib/password-credentials";
import { createParentSession } from "@/lib/parent-session";
import { hashIp as hashParentIp } from "@/lib/parent-rate-limit";
import { extractIp, hashIp } from "@/lib/rate-limit";
import { limitPasswordLogin } from "@/lib/rate-limit-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z
  .object({
    username: z.string().max(64),
    password: z.string().max(256),
  })
  .strict();

const NO_STORE = { "Cache-Control": "no-store" };

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
}

export async function POST(req: Request) {
  const requestVerdict = validateCredentialRequest(req);
  if (!requestVerdict.ok) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: requestVerdict.status, headers: NO_STORE },
    );
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return unauthorized();

  const username = normalizePasswordUsername(parsed.data.username);
  const clientIp = extractIp(req);
  const verdict = await limitPasswordLogin(
    hashIp(clientIp),
    hashIp(username),
  );
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": String(Math.max(1, verdict.retryAfter)) },
      },
    );
  }

  const verified = await verifyPasswordCredential(username, parsed.data.password);
  if (!verified) return unauthorized();

  const parent = await db.parent.findUnique({
    where: { email: verified.principalEmail },
    select: { id: true, email: true, parentDeletedAt: true },
  });
  if (!parent || parent.parentDeletedAt) return unauthorized();

  const teacherSession = await auth().catch(() => null);
  if (
    teacherSession?.user &&
    !isSameAccountPrincipal(teacherSession.user.email, parent.email)
  ) {
    await signOut({ redirect: false }).catch(() => undefined);
  }

  const link = await db.parentChildLink.findFirst({
    where: {
      parentId: parent.id,
      deletedAt: null,
      status: { in: ["active", "pending"] },
    },
    select: { id: true },
  });
  const ipHash = hashParentIp(clientIp);
  const session = await createParentSession({
    parentId: parent.id,
    userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    ipHash,
  });

  return NextResponse.json(
    {
      success: true,
      sessionToken: session.token,
      redirect: link ? "/parent/feed" : "/parent/onboard/match/code",
    },
    { headers: NO_STORE },
  );
}
