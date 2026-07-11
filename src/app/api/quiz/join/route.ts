import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { publishQuizRealtimeSnapshot } from "@/lib/quiz-realtime-snapshot";

export async function POST(req: Request) {
  try {
    const { roomCode, nickname, studentId } = await req.json();

    if (!roomCode) {
      return NextResponse.json({ error: "roomCode required" }, { status: 400 });
    }

    // Student join: use studentId to get name, skip nickname
    // Anonymous join: require nickname
    let resolvedNickname = nickname?.trim();
    let resolvedStudentId: string | null = null;

    if (studentId) {
      const student = await db.student.findUnique({ where: { id: studentId } });
      if (student) {
        resolvedNickname = student.name;
        resolvedStudentId = student.id;
      }
    }

    if (!resolvedNickname) {
      return NextResponse.json({ error: "nickname required" }, { status: 400 });
    }

    const quiz = await db.quiz.findUnique({
      where: { roomCode },
      include: { questions: { select: { id: true } } },
    });

    if (!quiz) {
      return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
    }

    if (quiz.status === "finished") {
      return NextResponse.json({ error: "이미 종료된 퀴즈입니다" }, { status: 400 });
    }

    // If student, check for existing player (prevent duplicate join)
    if (resolvedStudentId) {
      const existing = await db.quizPlayer.findUnique({
        where: { quizId_studentId: { quizId: quiz.id, studentId: resolvedStudentId } },
      });
      if (existing) {
        return NextResponse.json({
          player: existing,
          quiz: {
            id: quiz.id,
            title: quiz.title,
            status: quiz.status,
            questionCount: quiz.questions.length,
          },
        });
      }
    }

    const player = await db.quizPlayer.create({
      data: {
        quizId: quiz.id,
        nickname: resolvedNickname,
        studentId: resolvedStudentId,
      },
    });
    const snapshot = await publishQuizRealtimeSnapshot(quiz.id);

    return NextResponse.json({
      player,
      quiz: {
        id: quiz.id,
        title: quiz.title,
        status: quiz.status,
        questionCount: quiz.questions.length,
      },
      snapshot,
    });
  } catch (e) {
    console.error("[POST /api/quiz/join]", e);
    return NextResponse.json({ error: "Join failed" }, { status: 500 });
  }
}
