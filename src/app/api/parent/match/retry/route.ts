import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth-only";
import { checkRejectionCooldown } from "@/lib/rate-limit-parent";

// parent-class-invite-v2 — POST /api/parent/match/retry.
// Probes the rejection cooldown (3 rejections / 24h per email). Front-end
// calls this before sending the user back to /onboard/match/code so we can
// surface a 429 with the retry-after countdown early.

export async function POST(req: Request) {
  return withParentAuth(req, async (ctx) => {
    const gate = await checkRejectionCooldown(ctx.parent.email);
    if (!gate.ok) {
      return NextResponse.json(
        { error: "cooldown", cooldownSeconds: gate.retryAfterSec },
        { status: 429, headers: { "retry-after": String(gate.retryAfterSec) } }
      );
    }
    return NextResponse.json({ ok: true, cooldownSeconds: null });
  });
}
