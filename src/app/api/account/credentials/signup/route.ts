import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { validateCredentialRequest } from "@/lib/credential-request";
import {
  createPasswordHash,
  isValidAccountPassword,
  isValidPasswordUsername,
  localPrincipalEmail,
  normalizePasswordUsername,
} from "@/lib/password-credentials";
import { extractIp, hashIp } from "@/lib/rate-limit";
import { limitPasswordSignup } from "@/lib/rate-limit-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z
  .object({
    role: z.enum(["teacher", "parent"]),
    username: z.string().max(64),
    password: z.string().max(256),
  })
  .strict();

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const requestVerdict = validateCredentialRequest(req);
  if (!requestVerdict.ok) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: requestVerdict.status, headers: NO_STORE },
    );
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
  }

  const username = normalizePasswordUsername(parsed.data.username);
  const password = parsed.data.password;
  if (!isValidPasswordUsername(username) || !isValidAccountPassword(password)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 400, headers: NO_STORE });
  }

  const verdict = await limitPasswordSignup(
    hashIp(extractIp(req)),
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

  const principalEmail = localPrincipalEmail(username);
  const passwordHash = await createPasswordHash(password);

  try {
    await db.$transaction(async (tx) => {
      await tx.passwordCredential.create({
        data: { username, passwordHash, principalEmail },
      });
      if (parsed.data.role === "teacher") {
        await tx.user.create({
          data: { email: principalEmail, name: username },
        });
      } else {
        await tx.parent.create({
          data: { email: principalEmail, name: username },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "username_taken" }, { status: 409, headers: NO_STORE });
    }
    console.error("[password-signup] creation failed", error);
    return NextResponse.json({ error: "internal" }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true }, { status: 201, headers: NO_STORE });
}
