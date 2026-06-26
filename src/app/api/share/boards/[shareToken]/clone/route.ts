import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { authorizeShareAccess } from "@/lib/share/share-auth";
import {
  cloneTeacherBoard,
  SUPPORTED_CLONE_LAYOUTS,
} from "@/lib/boards/clone";

/**
 * POST /api/share/boards/[shareToken]/clone
 *
 * Clones a board that is currently shared in "student" mode into the current
 * teacher's workspace. Only teacher-authored material is copied — student
 * cards (studentAuthorId / externalAuthorName / externalAuthorKey) and any
 * engagement / response data are intentionally skipped. Share tokens, event
 * public tokens, classroom membership and default groups are NOT carried over.
 *
 * Response:
 *   200 { board: { id, slug, title }, boardUrl }
 *   401 { error: "unauthorized" }
 *   404 { error: "share_not_found" }
 *   400 { error: "unsupported_layout" }
 *   500 { error: "internal" }
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ shareToken: string }> },
) {
  let user: Awaited<ReturnType<typeof getCurrentUser>> | null = null;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { shareToken } = await params;
  if (!shareToken) {
    return NextResponse.json({ error: "share_not_found" }, { status: 404 });
  }

  const auth = await authorizeShareAccess(shareToken, "student");
  if (!auth.ok) {
    return NextResponse.json({ error: "share_not_found" }, { status: 404 });
  }

  try {
    const source = await db.board.findUnique({
      where: { id: auth.boardId },
      include: {
        sections: { orderBy: { order: "asc" } },
        cards: {
          orderBy: { order: "asc" },
          include: { authors: true },
        },
      },
    });

    if (!source || source.shareMode !== "student") {
      return NextResponse.json({ error: "share_not_found" }, { status: 404 });
    }

    if (!SUPPORTED_CLONE_LAYOUTS.has(source.layout)) {
      return NextResponse.json({ error: "unsupported_layout" }, { status: 400 });
    }

    const newTitle = source.title
      ? `${source.title} (복제본)`
      : "(복제본)";

    const newBoard = await db.$transaction(async (tx) => {
      return cloneTeacherBoard(tx, source, user!.id, {
        title: newTitle,
      });
    });

    const boardUrl = `/board/${newBoard.slug || newBoard.id}`;
    return NextResponse.json({
      board: {
        id: newBoard.id,
        slug: newBoard.slug,
        title: newBoard.title,
      },
      boardUrl,
    });
  } catch (e) {
    console.error("[POST /api/share/boards/:shareToken/clone]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
