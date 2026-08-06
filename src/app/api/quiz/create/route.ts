import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentities } from "@/lib/identity";
import { canAddCardToBoard } from "@/lib/card-permissions";
import { generateQuizFromText, type QuizCountSpec } from "@/lib/quiz-llm";
import { getTeacherKeyForBoard } from "@/lib/llm/teacher-key";
import type { QuizDifficulty, QuizDraftQuestion } from "@/types/quiz";

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
    const title = (formData.get("title") as string | null)?.trim() || null;

    const rawDifficulty = formData.get("difficulty") as string | null;
    const difficulty: QuizDifficulty = VALID_DIFFICULTIES.includes(
      rawDifficulty as QuizDifficulty
    )
      ? (rawDifficulty as QuizDifficulty)
      : "medium";

    const countMode = (formData.get("countMode") as string | null) ?? "auto";
    const rawCount = formData.get("questionCount") as string | null;
    const draftRaw = formData.get("draftQuestions") as string | null;

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

    // Draft-promotion path: caller already edited the questions client-side,
    // so the LLM is skipped entirely. We still require draftQuestions to be
    // a non-empty array of 4-option items.
    let questions: QuizDraftQuestion[];
    let sourceText: string | null = null;
    let sourceFile: string | null = null;

    if (draftRaw) {
      try {
        const parsed = JSON.parse(draftRaw) as QuizDraftQuestion[];
        if (!Array.isArray(parsed) || parsed.length === 0) {
          return NextResponse.json({ error: "draft_empty" }, { status: 400 });
        }
        for (const q of parsed) {
          if (
            !q?.question?.trim() ||
            !q.optionA?.trim() ||
            !q.optionB?.trim() ||
            !q.optionC?.trim() ||
            !q.optionD?.trim() ||
            !["A", "B", "C", "D"].includes(q.answer)
          ) {
            return NextResponse.json({ error: "draft_invalid" }, { status: 400 });
          }
        }
        questions = parsed.slice(0, 20);
      } catch {
        return NextResponse.json({ error: "draft_parse" }, { status: 400 });
      }
    } else {
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

      questions = await generateQuizFromText(text, llm, countSpec, difficulty);
      if (questions.length === 0) {
        return NextResponse.json({ error: "empty", message: "LLM이 문항을 생성하지 못했습니다." }, { status: 422 });
      }
      if (countSpec.mode === "fixed" && questions.length < countSpec.n) {
        return NextResponse.json(
          { error: "insufficient", received: questions.length, requested: countSpec.n },
          { status: 422 }
        );
      }
      sourceText = text.slice(0, 5000);
      sourceFile = file?.name ?? null;
    }

    let roomCode: string;
    do {
      roomCode = String(Math.floor(100000 + Math.random() * 900000));
    } while (await db.quiz.findUnique({ where: { roomCode } }));

    const quiz = await db.quiz.create({
      data: {
        boardId,
        title: title ?? file?.name ?? "퀴즈",
        sourceFile,
        sourceText,
        roomCode,
        difficulty,
        questions: {
          create: questions.map((q, i) => ({
            order: i,
            question: q.question,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            answer: q.answer,
          })),
        },
      },
      include: { questions: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json({ quiz });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Quiz creation failed";
    console.error("[POST /api/quiz/create]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
