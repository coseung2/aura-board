import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { issueQuizPlayerToken } from "@/lib/quiz-player-token";
import { publishQuizRealtimeSnapshot } from "@/lib/quiz-realtime-snapshot";

export async function POST(req: Request) {
  try {
    const student = await getCurrentStudent();
    const { roomCode, nickname, studentId } = await req.json();

    if (!roomCode) {
      return NextResponse.json({ error: "roomCode required" }, { status: 400 });
    }
    if (studentId && (!student || studentId !== student.id)) {
      return NextResponse.json({ error: "student_identity_mismatch" }, { status: 403 });
    }
    const resolvedNickname = student?.name ?? nickname?.trim();
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

    if (student) {
      const existing = await db.quizPlayer.findUnique({
        where: { quizId_studentId: { quizId: quiz.id, studentId: student.id } },
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
        studentId: student?.id ?? null,
      },
    });
    const playerToken = student
      ? undefined
      : issueQuizPlayerToken(player.id, quiz.id).token;
    const snapshot = await publishQuizRealtimeSnapshot(quiz.id);

    return NextResponse.json({
      player,
      quiz: {
        id: quiz.id,
        title: quiz.title,
        status: quiz.status,
        questionCount: quiz.questions.length,
      },
      ...(playerToken ? { playerToken } : {}),
      snapshot,
    });
  } catch (e) {
    console.error("[POST /api/quiz/join]", e);
    return NextResponse.json({ error: "Join failed" }, { status: 500 });
  }
}
