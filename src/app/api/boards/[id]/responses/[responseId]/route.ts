import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { announceQuestionChange } from "@/lib/realtime-broadcast";

// DELETE: 응답 삭제. 교사(owner/editor) 만 가능. 학생은 자기 것도 삭제 불가 (MVP).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; responseId: string }> }
) {
  const { id: boardIdOrSlug, responseId } = await params;

  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: { id: true },
  });
  if (!board) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = await getEffectiveBoardRole(board.id, {
    userId: user?.id,
    studentId: student?.id,
  });
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const response = await db.boardResponse.findUnique({ where: { id: responseId } });
  if (!response || response.boardId !== board.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.boardResponse.delete({ where: { id: responseId } });
  await touchBoardUpdatedAt(board.id);
  void announceQuestionChange(board.id, "response_delete", responseId);

  return NextResponse.json({ ok: true });
}
