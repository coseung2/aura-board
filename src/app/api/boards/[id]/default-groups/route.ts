import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import {
  loadBoardDefaultGroups,
  loadClassroomDefaultGroups,
} from "@/lib/default-groups";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    const { id } = await params;
    const board = await db.board.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true, classroomId: true },
    });
    if (!board) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await requirePermission(board.id, user.id, "edit");

    const students = board.classroomId
      ? await db.student.findMany({
          where: { classroomId: board.classroomId },
          orderBy: [{ number: "asc" }, { name: "asc" }],
          select: { id: true, name: true, number: true },
        })
      : [];
    const boardGroups = await loadBoardDefaultGroups(db, board.id);
    const groups =
      boardGroups.length > 0 || !board.classroomId
        ? boardGroups
        : await loadClassroomDefaultGroups(db, board.classroomId);

    return NextResponse.json({
      classroomId: board.classroomId,
      students,
      groups,
    });
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("[GET /api/boards/:id/default-groups]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
