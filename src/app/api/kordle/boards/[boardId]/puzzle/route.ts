import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";

type Params = { params: Promise<{ boardId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { boardId } = await params;
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const game = await db.kordleGame.findUnique({
    where: { boardId },
    select: {
      id: true,
      wordLength: true,
      maxGuesses: true,
      locale: true,
      board: { select: { classroomId: true } },
      puzzles: {
        where: { status: { in: ["LIVE", "SCHEDULED"] } },
        orderBy: { startsAt: "desc" },
        take: 1,
        select: { id: true, status: true, startsAt: true, endsAt: true },
      },
    },
  });
  if (!game) {
    return NextResponse.json({ error: "game_not_found" }, { status: 404 });
  }
  if (game.board.classroomId !== student.classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const puzzle = game.puzzles[0] ?? null;
  return NextResponse.json({
    gameId: game.id,
    wordLength: game.wordLength,
    maxGuesses: game.maxGuesses,
    locale: game.locale,
    puzzle,
  });
}
