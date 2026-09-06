import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import { canAccessSubmission } from "@/lib/assessment-permissions";

import { withProductFeature } from "@/lib/product-release-server";

export const POST = withProductFeature("developmentLayouts", POSTHandler);
async function POSTHandler(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: submissionId } = await params;
  const ids = await resolveIdentities();
  const access = await canAccessSubmission(submissionId, ids);
  if (!access.allowed || !access.asTeacher) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const existing = await db.gradebookEntry.findUnique({
    where: { submissionId },
  });
  if (!existing) {
    return NextResponse.json({ error: "not_finalized" }, { status: 409 });
  }
  if (existing.releasedAt) {
    return NextResponse.json({ entry: existing });
  }

  const entry = await db.gradebookEntry.update({
    where: { submissionId },
    data: { releasedAt: new Date() },
  });
  return NextResponse.json({ entry });
}
