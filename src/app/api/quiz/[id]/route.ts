import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import { canManageQuiz } from "@/lib/quiz-permissions";
import { publishQuizRealtimeSnapshot } from "@/lib/quiz-realtime-snapshot";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ids = await resolveIdentities();
  if (ids.primary === "anon") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const canManage = await canManageQuiz(id, ids);
  if (!canManage) {
    if (!ids.student) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const player = await db.quizPlayer.findUnique({
      where: {
        quizId_studentId: { quizId: id, studentId: ids.student.studentId },
      },
      select: { id: true },
    });
    if (!player) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const quiz = await db.quiz.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: "asc" } },
      players: { orderBy: { score: "desc" } },
    },
  });

  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  if (canManage) return NextResponse.json({ quiz });

  return NextResponse.json({
    quiz: {
      ...quiz,
      questions: quiz.questions.map(({ answer: _answer, ...question }) => question),
      players: quiz.players.map((player) => ({ ...player, studentId: null })),
    },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ids = await resolveIdentities();
  if (ids.primary === "anon") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await canManageQuiz(id, ids))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body; // "start" | "next" | "finish"

  const quiz = await db.quiz.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  let updated;

  if (action === "start") {
    updated = await db.quiz.update({
      where: { id },
      data: { status: "active", currentQ: 0 },
    });
  } else if (action === "next") {
    const nextQ = quiz.currentQ + 1;
    if (nextQ >= quiz.questions.length) {
      updated = await db.quiz.update({
        where: { id },
        data: { status: "finished", currentQ: nextQ },
      });
    } else {
      updated = await db.quiz.update({
        where: { id },
        data: { currentQ: nextQ },
      });
    }
  } else if (action === "finish") {
    updated = await db.quiz.update({
      where: { id },
      data: { status: "finished" },
    });
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const snapshot = await publishQuizRealtimeSnapshot(id);
  return NextResponse.json({ quiz: updated, snapshot });
}
