import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import {
  canEditCard,
  type BoardLike,
  type CardLike,
} from "@/lib/card-permissions";
import {
  setCardAuthors,
  MAX_AUTHORS_PER_CARD,
  MAX_DISPLAY_NAME_LEN,
  CardAuthorError,
} from "@/lib/card-authors-service";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { normalizeStudentAuthorInputs } from "@/lib/student-card-authors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AuthorEntrySchema = z.object({
  studentId: z.string().min(1).max(40).nullable().optional(),
  displayName: z.string().min(1).max(MAX_DISPLAY_NAME_LEN),
});

const BodySchema = z.object({
  authors: z.array(AuthorEntrySchema).max(MAX_AUTHORS_PER_CARD),
});

/**
 * PUT /api/cards/:id/authors — teacher-only replace-all.
 *
 * Why replace-all and not a PATCH-per-row API:
 *   - a single transaction guarantees Card.studentAuthorId mirror and
 *     CardAuthor.order=0 stay consistent
 *   - the editor UX is a whole-list pick-and-save, not individual CRUD
 *   - simpler contract for retry / idempotency
 *
 * Boards without a classroom skip the student-membership guard so
 * free-form display rows (no studentId) are allowed everywhere.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const card = await db.card.findUnique({ where: { id } });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    const board = await db.board.findUnique({
      where: { id: card.boardId },
      select: {
        id: true,
        classroomId: true,
        classroom: { select: { teacherId: true } },
      },
    });
    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    const identity = await resolveIdentities();
    const boardLike: BoardLike = {
      id: board.id,
      classroomId: board.classroomId,
      ownerUserId: board.classroom?.teacherId ?? null,
    };
    const cardLike: CardLike = {
      id: card.id,
      boardId: card.boardId,
      authorId: card.authorId,
      studentAuthorId: card.studentAuthorId,
    };

    // Author re-assignment gate — canEditCard already captures both
    // teacher-owner AND student-own-card permissions. Boards without a
    // classroom (free-form) keep the same rule: teacher owner only.
    // student-author-edit (2026-04-20): students on their own card are
    // now allowed per scope §2-IN. setCardAuthors' classroomId guard
    // prevents a student from naming a student outside their classroom.
    if (!canEditCard(identity, boardLike, cardLike)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_input", detail: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    }

    let authorInputs = parsed.data.authors;
    if (!identity.teacher && identity.student) {
      const roster = await db.student.findMany({
        where: { classroomId: board.classroomId ?? undefined },
        select: { id: true, name: true },
      });
      const normalized = normalizeStudentAuthorInputs(
        authorInputs,
        identity.student.studentId,
        roster,
      );
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.error }, { status: 400 });
      }
      authorInputs = normalized.authors;
    }

    const result = await db.$transaction(async (tx) => {
      return await setCardAuthors(tx, card.id, authorInputs, {
        classroomId: board.classroomId,
      });
    });

    const savedAuthors = await db.cardAuthor.findMany({
      where: { cardId: card.id },
      orderBy: { order: "asc" },
      select: { id: true, studentId: true, displayName: true, order: true },
    });

    // classroom-boards-tab "🟢 새 활동" 배지 — 작성자 재지정도 카드 mutation.
    await touchBoardUpdatedAt(card.boardId);

    return NextResponse.json({
      authors: savedAuthors,
      primary: {
        studentAuthorId: result.primaryStudentId,
        externalAuthorName: result.externalAuthorName,
      },
    });
  } catch (e) {
    if (e instanceof CardAuthorError) {
      return NextResponse.json(
        { error: e.code, detail: e.message },
        { status: 400 },
      );
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    console.error("[PUT /api/cards/:id/authors]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
