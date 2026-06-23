import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ForbiddenError, requirePermission } from "@/lib/rbac";
import { issueTeacherAccessToken } from "@/lib/oauth-teacher";

type RouteContext = { params: Promise<{ id: string }> };

type AuraAssessmentPlan = {
  id?: string;
  subject: string;
  unit: string;
  criterion: string;
  title?: string | null;
  date?: string | null;
};

function normalizePlan(raw: unknown): AuraAssessmentPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const subject = typeof row.subject === "string" ? row.subject.trim() : "";
  const unit = typeof row.unit === "string" ? row.unit.trim() : "";
  const criterion = typeof row.criterion === "string" ? row.criterion.trim() : "";
  if (!subject || !unit || !criterion) return null;
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    subject,
    unit,
    criterion,
    title: typeof row.title === "string" ? row.title : null,
    date: typeof row.date === "string" ? row.date : null,
  };
}

function parsePlans(payload: unknown): AuraAssessmentPlan[] {
  const source =
    payload && typeof payload === "object"
      ? ((payload as { plans?: unknown; items?: unknown }).plans ??
        (payload as { items?: unknown }).items)
      : null;
  if (!Array.isArray(source)) return [];
  const seen = new Set<string>();
  const plans: AuraAssessmentPlan[] = [];
  for (const raw of source) {
    const plan = normalizePlan(raw);
    if (!plan) continue;
    const key = `${plan.subject}\u001f${plan.unit}\u001f${plan.criterion}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plans.push(plan);
  }
  return plans;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id: boardIdOrSlug } = await params;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: {
      id: true,
      classroom: { select: { code: true } },
    },
  });
  if (!board) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    await requirePermission(board.id, user.id, "edit");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw e;
  }

  const baseUrl =
    process.env.AURA_APP_BASE_URL?.trim() || "https://aura-teacher.com";

  let accessToken: string;
  try {
    const issued = await issueTeacherAccessToken({
      userId: user.id,
      clientId: "aura-companion",
      scope: "external:read",
    });
    accessToken = issued.accessToken;
  } catch {
    return NextResponse.json(
      { plans: [], error: "aura_oauth_token_issue_failed" },
      { status: 502 },
    );
  }

  let response: Response;
  try {
    const url = new URL("/api/external/aura-board/assessment-plans", baseUrl);
    url.searchParams.set("auraboardTeacherId", user.id);
    if (board.classroom?.code) {
      url.searchParams.set("classroomCode", board.classroom.code);
    }
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { plans: [], error: "aura_assessment_plans_fetch_failed" },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    return NextResponse.json(
      {
        plans: [],
        error:
          response.status === 401
            ? "aura_oauth_verify_failed"
            : "aura_assessment_plans_fetch_failed",
        upstreamStatus: response.status,
        upstreamError: detail?.error ?? null,
      },
      { status: 502 },
    );
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return NextResponse.json({ plans: parsePlans(payload) });
}
