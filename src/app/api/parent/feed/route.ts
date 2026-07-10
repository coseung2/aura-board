import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { EXCLUDED_BOARD_LAYOUTS } from "@/lib/portfolio-acl-pure";
import { mapPortfolioCard } from "@/lib/portfolio-card-mapper";
import type { PortfolioCardDTO } from "@/lib/portfolio-dto";
import {
  decodeParentFeedCursor,
  encodeParentFeedCursor,
} from "@/lib/parent-feed-cursor";
import { withParentScopeForStudent } from "@/lib/parent-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;
const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

function parseLimit(value: string | null): number | null {
  if (value === null) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, MAX_LIMIT);
}

// GET /api/parent/feed?childId=:studentId&limit=12&cursor=:opaqueCursor
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const childId = searchParams.get("childId")?.trim() ?? "";
  if (!childId) return json({ error: "childId_required" }, 400);

  const limit = parseLimit(searchParams.get("limit"));
  if (limit === null) return json({ error: "invalid_limit" }, 400);

  const rawCursor = searchParams.get("cursor");
  const cursor = rawCursor ? decodeParentFeedCursor(rawCursor) : null;
  if (rawCursor !== null && !cursor) {
    return json({ error: "invalid_cursor" }, 400);
  }

  const response = await withParentScopeForStudent(req, childId, async () => {
    const child = await db.student.findUnique({
      where: { id: childId },
      select: {
        id: true,
        name: true,
        number: true,
        classroomId: true,
        classroom: { select: { name: true } },
      },
    });
    if (!child) return json({ error: "child_not_found" }, 404);

    const rows = await db.card.findMany({
      where: {
        AND: [
          {
            OR: [
              { studentAuthorId: childId },
              { authors: { some: { studentId: childId } } },
            ],
          },
          { OR: [{ queueStatus: null }, { queueStatus: { not: "played" } }] },
          ...(cursor
            ? [
                {
                  OR: [
                    { createdAt: { lt: cursor.createdAt } },
                    {
                      createdAt: cursor.createdAt,
                      id: { lt: cursor.id },
                    },
                  ],
                },
              ]
            : []),
        ],
        board: { layout: { notIn: [...EXCLUDED_BOARD_LAYOUTS] } },
      },
      include: {
        author: { select: { name: true } },
        studentAuthor: { select: { name: true } },
        board: {
          select: {
            id: true,
            slug: true,
            title: true,
            layout: true,
            anonymousAuthor: true,
          },
        },
        section: { select: { id: true, title: true } },
        authors: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            studentId: true,
            displayName: true,
            order: true,
          },
        },
        attachments: { orderBy: { order: "asc" } },
        showcaseEntries: { select: { studentId: true } },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items: PortfolioCardDTO[] = pageRows.map((card) =>
      mapPortfolioCard(card, null),
    );
    const last = pageRows.at(-1);
    const nextCursor =
      hasMore && last
        ? encodeParentFeedCursor({ createdAt: last.createdAt, id: last.id })
        : null;

    return json({
      child: {
        id: child.id,
        name: child.name,
        number: child.number,
        classroomId: child.classroomId,
        classroomName: child.classroom.name,
      },
      items,
      nextCursor,
    });
  });

  // The scope helper owns 401/403 responses, so apply the same cache policy
  // after it returns as well as on successful and validation responses.
  response.headers.set("Cache-Control", PRIVATE_NO_STORE_HEADERS["Cache-Control"]);
  response.headers.set("Vary", PRIVATE_NO_STORE_HEADERS.Vary);
  return response;
}
