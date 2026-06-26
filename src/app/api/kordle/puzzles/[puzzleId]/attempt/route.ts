import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { ensureAttempt, getPublicState } from "@/features/kordle/server/kordleServer";

type Params = { params: Promise<{ puzzleId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { puzzleId } = await params;
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const puzzle = await db.kordlePuzzle.findUnique({
    where: { id: puzzleId },
    select: {
      id: true,
      game: { select: { boardId: true, board: { select: { classroomId: true } } } },
    },
  });
  if (!puzzle) {
    return NextResponse.json({ error: "puzzle_not_found" }, { status: 404 });
  }
  if (puzzle.game.board.classroomId !== student.classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const attemptId = await ensureAttempt({
    puzzleId,
    studentId: student.id,
    vibePlaySessionId: null,
  });
  const state = await getPublicState({ attemptId, studentId: student.id });
  return NextResponse.json({ attemptId, state });
}
