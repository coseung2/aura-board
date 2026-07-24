import { NextResponse } from "next/server";
import {
  fetchParentPosts,
  loadParentChildSummaries,
  PARENT_PRIVATE_NO_STORE_HEADERS,
  parseParentPostPagination,
} from "@/lib/parent-posts";
import { withParentScope } from "@/lib/parent-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: PARENT_PRIVATE_NO_STORE_HEADERS,
  });
}

// GET /api/parent/feed?limit=12&cursor=:opaqueCursor
export async function GET(req: Request) {
  const searchParams = new URL(req.url).searchParams;
  const pagination = parseParentPostPagination(searchParams);
  if ("error" in pagination) return json({ error: pagination.error }, 400);

  const response = await withParentScope(req, async (ctx) => {
    const children = await loadParentChildSummaries(
      ctx.childLinks.map((link) => link.studentId),
    );
    return json(await fetchParentPosts({ children, ...pagination }));
  });

  response.headers.set("Cache-Control", PARENT_PRIVATE_NO_STORE_HEADERS["Cache-Control"]);
  response.headers.set("Vary", PARENT_PRIVATE_NO_STORE_HEADERS.Vary);
  return response;
}
