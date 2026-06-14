import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { dispatchMagicLink, signMagicLink } from "@/lib/parent-magic-link";
import { extractClientIp, isIpLocked, recordIpFailure } from "@/lib/parent-rate-limit";

// parent-class-invite-v2 — POST /api/parent/signup
// Email-only signup. Upserts Parent row, dispatches a 15-min magic link.
// Rate-limited by IP (5 / 15m via parent-rate-limit).
//
// Mobile handoff (Phase 3+):
//   Mobile clients post `{ email, client: "mobile" }`. The dispatched
//   magic-link URL includes `client=mobile` so the callback handler can
//   hand the issued ParentSession back via the `auraboard://parent/auth/callback`
//   deep link (token + expiresAt in URL fragment, never query string).
//   Web behavior is unchanged: default `client` is "web".

const Schema = z.object({
  email: z.string().email().max(200),
  client: z.enum(["web", "mobile"]).optional(),
});

export async function POST(req: Request) {
  const ip = extractClientIp(req);
  if (isIpLocked(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    recordIpFailure(ip);
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();
  const client = parsed.data.client ?? "web";

  try {
    const parent = await db.parent.upsert({
      where: { email },
      update: { parentDeletedAt: null },
      create: { email, name: email.split("@")[0] ?? "학부모" },
    });
    const token = signMagicLink(parent.id);
    const origin = new URL(req.url).origin;
    const callback = new URL("/parent/auth/callback", origin);
    callback.searchParams.set("token", token);
    if (client === "mobile") callback.searchParams.set("client", "mobile");
    const magicLinkUrl = callback.toString();
    const dispatch = await dispatchMagicLink(email, magicLinkUrl);

    return NextResponse.json({
      ok: true,
      message: "매직링크를 발송했습니다",
      devMagicLinkUrl: dispatch.devUrl ?? null,
    });
  } catch (e) {
    console.error("[POST /api/parent/signup]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
