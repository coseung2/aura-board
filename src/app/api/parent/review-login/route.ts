import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  getParentReviewCredentialConfig,
  hashParentReviewCode,
  normalizeParentReviewCode,
  parentReviewIdentityMatches,
  verifyParentReviewCode,
} from "@/lib/parent-review-credentials";
import { createParentSession } from "@/lib/parent-session";
import { extractClientIp, hashIp } from "@/lib/parent-rate-limit";
import { limitParentReviewLogin } from "@/lib/rate-limit-routes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ReviewLoginBody = z
  .object({
    code: z.string().trim().min(1).max(256),
  })
  .strict();

const NO_STORE = { "Cache-Control": "no-store" };

function unauthorized() {
  // Keep account existence, environment readiness, and code validity on one
  // indistinguishable response path.
  return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
}

function rateLimited(retryAfter: number) {
  return NextResponse.json(
    { error: "rate_limited" },
    {
      status: 429,
      headers: {
        ...NO_STORE,
        "Retry-After": String(Math.max(1, retryAfter || 1)),
      },
    },
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ReviewLoginBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: NO_STORE },
    );
  }

  const code = normalizeParentReviewCode(parsed.data.code);
  const ipHash = hashIp(extractClientIp(req));
  const ipKey = ipHash ?? "unknown";

  // Never put the submitted code itself in a Redis key, log, or response.
  let verdict;
  try {
    verdict = await limitParentReviewLogin(ipKey, hashParentReviewCode(code));
  } catch (error) {
    console.error("[parent-review-login] rate limiter failed", error);
    return rateLimited(5);
  }
  if (!verdict.ok) return rateLimited(verdict.retryAfter);

  const config = getParentReviewCredentialConfig();
  let parent: {
    id: string;
    email: string;
    name: string;
    parentDeletedAt: Date | null;
  } | null = null;

  try {
    // Run lookup and KDF together. A missing configuration still performs a
    // dummy KDF inside verifyParentReviewCode and receives the same 401.
    const [candidate, codeMatches] = await Promise.all([
      config
        ? config.parentId
          ? db.parent.findUnique({
              where: { id: config.parentId },
              select: { id: true, email: true, name: true, parentDeletedAt: true },
            })
          : db.parent.findUnique({
              where: { email: config.email! },
              select: { id: true, email: true, name: true, parentDeletedAt: true },
            })
        : Promise.resolve(null),
      verifyParentReviewCode(code, config?.codeHash ?? ""),
    ]);

    if (
      !config ||
      !codeMatches ||
      !candidate ||
      candidate.parentDeletedAt ||
      !parentReviewIdentityMatches(candidate, config)
    ) {
      return unauthorized();
    }

    // A review account must already be connected to at least one live child;
    // this prevents a configured but unprovisioned parent row from becoming a
    // useful login target. Keep the no-link case on the same generic 401 path.
    const activeLink = await db.parentChildLink.findFirst({
      where: {
        parentId: candidate.id,
        status: "active",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!activeLink) return unauthorized();

    parent = candidate;
  } catch (error) {
    // Do not turn a missing/invalid account configuration into a distinct
    // public response. Keep details in server logs only.
    console.error("[parent-review-login] verification failed", error);
    return unauthorized();
  }

  if (!parent) return unauthorized();

  try {
    const session = await createParentSession({
      parentId: parent.id,
      userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
      ipHash,
    });

    return NextResponse.json(
      { success: true, sessionToken: session.token },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[parent-review-login] session creation failed", error);
    return NextResponse.json(
      { error: "internal" },
      { status: 500, headers: NO_STORE },
    );
  }
}
