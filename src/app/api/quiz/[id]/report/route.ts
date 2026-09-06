import { NextResponse } from "next/server";
import { resolveIdentities } from "@/lib/identity";
import { canManageQuiz } from "@/lib/quiz-permissions";
import { buildQuizReport } from "@/lib/quiz-report";

import { withProductFeature } from "@/lib/product-release-server";

export const GET = withProductFeature("developmentLayouts", GETHandler);
async function GETHandler(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ids = await resolveIdentities();
  if (!(await canManageQuiz(id, ids))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const report = await buildQuizReport(id);
  if (!report) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(report);
}
