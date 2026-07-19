import { NextResponse } from "next/server";
import {
  fetchParentPosts,
  findParentPostFocus,
  loadParentChildSummaries,
  PARENT_PRIVATE_NO_STORE_HEADERS,
  parseParentPostFocus,
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
  const focusPostId = parseParentPostFocus(searchParams);
  if (focusPostId && typeof focusPostId === "object") {
    return json({ error: focusPostId.error }, 400);
  }
  if (focusPostId && pagination.cursor) {
    return json({ error: "invalid_cursor" }, 400);
  }

  const response = await withParentScope(req, async (ctx) => {
    const children = await loadParentChildSummaries(
      ctx.childLinks.map((link) => link.studentId),
    );
    const startAt = focusPostId
      ? await findParentPostFocus(children, focusPostId)
      : null;
    if (focusPostId && !startAt) {
      return json({ error: "post_not_found" }, 404);
    }

    const page = await fetchParentPosts({ children, startAt, ...pagination });
    if (focusPostId && page.items[0]?.id !== focusPostId) {
      return json({ error: "post_not_found" }, 404);
    }
    return json(page);
  });

  response.headers.set("Cache-Control", PARENT_PRIVATE_NO_STORE_HEADERS["Cache-Control"]);
  response.headers.set("Vary", PARENT_PRIVATE_NO_STORE_HEADERS.Vary);
  return response;
}
