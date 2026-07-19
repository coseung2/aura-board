import { NextResponse } from "next/server";
import {
  fetchParentPosts,
  loadParentChildSummaries,
  PARENT_PRIVATE_NO_STORE_HEADERS,
  parseParentPostKind,
  parseParentPostPagination,
} from "@/lib/parent-posts";
import { withParentScopeForStudent } from "@/lib/parent-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: PARENT_PRIVATE_NO_STORE_HEADERS,
  });
}

// GET /api/parent/children/:id/posts?limit=12&cursor=:opaqueCursor
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const pagination = parseParentPostPagination(new URL(req.url).searchParams);
  if ("error" in pagination) return json({ error: pagination.error }, 400);
  const kind = parseParentPostKind(new URL(req.url).searchParams);
  if (kind && typeof kind === "object") return json({ error: kind.error }, 400);

  const { id: studentId } = await ctx.params;
  const response = await withParentScopeForStudent(req, studentId, async () => {
    const [child] = await loadParentChildSummaries([studentId]);
    if (!child) return json({ error: "child_not_found" }, 404);

    const page = await fetchParentPosts({
      children: [child],
      kind,
      ...pagination,
    });
    return json({ child, ...page });
  });

  response.headers.set("Cache-Control", PARENT_PRIVATE_NO_STORE_HEADERS["Cache-Control"]);
  response.headers.set("Vary", PARENT_PRIVATE_NO_STORE_HEADERS.Vary);
  return response;
}
