import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

// PV-11 — 90-day PII anonymization sweep.
//
// Trigger: Vercel Cron daily at 15:30 UTC (00:30 KST next day). Finds Parent
// rows where:
//   - parentDeletedAt IS NOT NULL
//   - parentDeletedAt <= now - 90 days
//   - anonymizedAt IS NULL
// and replaces:
//   - email  → "anonymized_<sha256(email)>@deleted.invalid"
//   - name   → "탈퇴한 이용자"
// Also drops all ParentSession rows for that parent (no-op after 90 days;
// defensive) and stamps anonymizedAt.
//
// We keep the Parent row itself for referential integrity — ParentChildLink
// rows may still be joined to it in audit queries.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - NINETY_DAYS_MS);

  const targets = await db.parent.findMany({
    where: {
      parentDeletedAt: { not: null, lte: cutoff },
      anonymizedAt: null,
    },
    select: { id: true, email: true },
  });

  let anonymized = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const target of targets) {
    try {
      const hashedEmail = sha256(target.email);
      const anonEmail = `anonymized_${hashedEmail.slice(0, 24)}@deleted.invalid`;
      await db.$transaction([
        db.parent.update({
          where: { id: target.id },
          data: {
            email: anonEmail,
            name: "탈퇴한 이용자",
            anonymizedAt: now,
          },
        }),
        // Defensive cleanup — sessions should already be revoked on withdraw,
        // but any stragglers get purged here.
        db.parentSession.deleteMany({ where: { parentId: target.id } }),
      ]);
      anonymized++;
    } catch (e) {
      errors.push({ id: target.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: now.toISOString(),
    cutoff: cutoff.toISOString(),
    eligible: targets.length,
    anonymized,
    errorCount: errors.length,
    errors: errors.slice(0, 10),
  });
}
