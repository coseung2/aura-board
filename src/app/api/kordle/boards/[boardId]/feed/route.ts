import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import type { GuessFeedback } from "@/features/kordle/engine";

type Params = { params: Promise<{ boardId: string }> };

function correctCount(feedback: unknown): number {
  if (!Array.isArray(feedback)) return 0;
  return (feedback as GuessFeedback).filter((item) => item?.state === "correct").length;
}

export async function GET(req: Request, { params }: Params) {
  const { boardId: boardIdOrSlug } = await params;
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 15000);

  const student = await getCurrentStudent();
  const user = student ? null : await getCurrentUser().catch(() => null);
  if (!student && !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardIdOrSlug }, { slug: boardIdOrSlug }] },
    select: {
      id: true,
      classroomId: true,
      members: user
        ? {
            where: {
              userId: user.id,
              role: { in: ["owner", "editor"] },
            },
            select: { id: true },
          }
        : false,
    },
  });
  if (!board) {
    return NextResponse.json({ error: "board_not_found" }, { status: 404 });
  }
  if (student && board.classroomId !== student.classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (user && board.members.length === 0) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const game = await db.kordleGame.findUnique({
    where: { boardId: board.id },
    select: {
      puzzles: {
        where: { status: { in: ["DRAFT", "LIVE", "CLOSED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  const puzzle = game?.puzzles[0] ?? null;
  if (!puzzle) {
    return NextResponse.json({ events: [], serverTime: new Date().toISOString() });
  }

  const guesses = await db.kordleGuess.findMany({
    where: {
      createdAt: { gt: Number.isNaN(since.getTime()) ? new Date(Date.now() - 15000) : since },
      attempt: { puzzleId: puzzle.id },
    },
    orderBy: { createdAt: "asc" },
    take: 12,
    select: {
      id: true,
      guessIndex: true,
      feedback: true,
      createdAt: true,
      attempt: {
        select: {
          student: { select: { name: true } },
          teacherUser: { select: { name: true } },
        },
      },
    },
  });

  const events = guesses
    .map((guess) => {
      const count = correctCount(guess.feedback);
      return {
        id: guess.id,
        name: guess.attempt.student?.name ?? guess.attempt.teacherUser?.name ?? "누군가",
        guessIndex: guess.guessIndex,
        correctCount: count,
        createdAt: guess.createdAt.toISOString(),
      };
    })
    .filter((event) => event.correctCount > 0);

  return NextResponse.json({ events, serverTime: new Date().toISOString() });
}
