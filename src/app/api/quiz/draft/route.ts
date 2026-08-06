import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import { canAddCardToBoard } from "@/lib/card-permissions";
import { generateQuizFromText, type QuizCountSpec } from "@/lib/quiz-llm";
import { getTeacherKeyForBoard } from "@/lib/llm/teacher-key";
import type { QuizDifficulty } from "@/types/quiz";

const VALID_DIFFICULTIES: readonly QuizDifficulty[] = ["easy", "medium", "hard"];

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.min(20, Math.max(1, Math.floor(n)));
}

export async function POST(req: Request) {
  try {
    const ids = await resolveIdentities();
    const formData = await req.formData();
    const boardId = formData.get("boardId") as string;
    const textContent = formData.get("text") as string | null;
    const file = formData.get("file") as File | null;

    const rawDifficulty = formData.get("difficulty") as string | null;
    const difficulty: QuizDifficulty = VALID_DIFFICULTIES.includes(
      rawDifficulty as QuizDifficulty
    )
      ? (rawDifficulty as QuizDifficulty)
      : "medium";

    const countMode = (formData.get("countMode") as string | null) ?? "auto";
    const rawCount = formData.get("questionCount") as string | null;

    if (!boardId) {
      return NextResponse.json({ error: "boardId required" }, { status: 400 });
    }

    const board = await db.board.findUnique({
      where: { id: boardId },
      select: {
        id: true,
        classroomId: true,
        classroom: { select: { teacherId: true } },
        members: { where: { role: "owner" }, select: { userId: true } },
      },
    });
    if (!board) {
      return NextResponse.json({ error: "board_not_found" }, { status: 404 });
    }
    const boardLike = {
      id: board.id,
      classroomId: board.classroomId,
      ownerUserId:
        board.classroom?.teacherId ?? board.members[0]?.userId ?? null,
    };
    if (!canAddCardToBoard(ids, boardLike)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const llm = await getTeacherKeyForBoard(boardId, "quiz");
    if (!llm) {
      return NextResponse.json(
        {
          error: "llm_not_configured",
          message: "교사 설정에서 퀴즈 생성용 AI와 API 키를 연결해주세요.",
        },
        { status: 400 },
      );
    }

    let text = textContent ?? "";
    if (file && !text) {
      if (file.type === "application/pdf") {
        // @ts-expect-error pdf-parse types do not correctly export default
        const pdfParse = (await import("pdf-parse")).default;
        const buffer = Buffer.from(await file.arrayBuffer());
        const pdf = await pdfParse(buffer);
        text = pdf.text;
      } else {
        text = await file.text();
      }
    }
    if (!text.trim()) {
      return NextResponse.json({ error: "No text content provided" }, { status: 400 });
    }

    const countSpec: QuizCountSpec =
      countMode === "fixed"
        ? { mode: "fixed", n: clampCount(parseInt(rawCount ?? "5", 10)) }
        : { mode: "auto" };

    const questions = await generateQuizFromText(
      text,
      llm,
      countSpec,
      difficulty,
    );

    if (questions.length === 0) {
      return NextResponse.json(
        { error: "empty", message: "LLM이 문항을 생성하지 못했습니다." },
        { status: 422 }
      );
    }
    if (countSpec.mode === "fixed" && questions.length < countSpec.n) {
      return NextResponse.json(
        { error: "insufficient", received: questions.length, requested: countSpec.n },
        { status: 422 }
      );
    }

    return NextResponse.json({ questions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Draft generation failed";
    console.error("[POST /api/quiz/draft]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
