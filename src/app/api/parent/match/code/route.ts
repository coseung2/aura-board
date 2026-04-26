import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withParentAuth } from "@/lib/parent-auth-only";
import { hashCode, normalizeCode, CODE_LENGTH } from "@/lib/class-invite-codes";
import { checkMatchLimit, recordMatchAttempt } from "@/lib/rate-limit-parent";
import { extractClientIp } from "@/lib/parent-rate-limit";
import { issueTicket } from "@/lib/match-ticket";

// parent-class-invite-v2 — POST /api/parent/match/code.
// Validates a CODE_LENGTH-char Crockford code, returns a short-lived match
// ticket + classroom name.

const Schema = z.object({ code: z.string().min(1).max(32) });

export async function POST(req: Request) {
  return withParentAuth(req, async (ctx) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const normalized = normalizeCode(parsed.data.code);
    if (normalized.length !== CODE_LENGTH) {
      return NextResponse.json({ error: "code_not_found" }, { status: 404 });
    }

    const ip = extractClientIp(req);
    // Check by axis (code+classroomId known only after DB lookup; check IP first).
    const pre = checkMatchLimit(ip, null, null);
    if (!pre.ok) {
      return NextResponse.json(
        { error: "rate_limited", axis: pre.axis, retryAfter: pre.retryAfterSec },
        { status: 429, headers: { "retry-after": String(pre.retryAfterSec) } }
      );
    }

    const invite = await db.classInviteCode.findUnique({
      where: { codeHash: hashCode(normalized) },
      include: { classroom: true },
    });

    // Post-lookup limit axes.
    const full = checkMatchLimit(
      ip,
      normalized,
      invite?.classroomId ?? null
    );
    if (!full.ok) {
      return NextResponse.json(
        { error: "rate_limited", axis: full.axis, retryAfter: full.retryAfterSec },
        { status: 429, headers: { "retry-after": String(full.retryAfterSec) } }
      );
    }
    recordMatchAttempt(ip, normalized, invite?.classroomId ?? null);

    if (!invite || invite.rotatedAt) {
      return NextResponse.json({ error: "code_not_found" }, { status: 404 });
    }
    if (invite.expiresAt && invite.expiresAt <= new Date()) {
      return NextResponse.json({ error: "code_expired" }, { status: 410 });
    }

    const ticket = issueTicket({
      parentSessionId: ctx.session.id,
      classroomId: invite.classroomId,
      classroomName: invite.classroom.name,
    });

    return NextResponse.json({
      ticket,
      classroomName: invite.classroom.name,
    });
  });
}
