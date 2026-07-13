import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";

/**
 * 학생 보드 탭 전용 목록.
 *
 * 홈 화면의 /api/student/me payload는 과제·역할·체크 태스크 집계까지 포함한다.
 * 보드 탭에서는 목록 렌더링에 필요한 보드 메타만 조회해 탭 전환 대기 시간을
 * 줄인다. 상세 보드의 카드/섹션 데이터는 기존 /api/student/board/:slug에서
 * 계속 가져온다.
 */
export async function GET() {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const boards = await db.board.findMany({
      where: { classroomId: student.classroomId },
      select: {
        id: true,
        slug: true,
        title: true,
        layout: true,
        category: true,
        anonymousAuthor: true,
        thumbnailMode: true,
        thumbnailUrl: true,
        boardTheme: true,
        streamSectionsEnabled: true,
        quizzes: {
          select: { roomCode: true, status: true },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
        kordleGame: {
          select: {
            puzzles: {
              where: { status: { in: ["DRAFT", "LIVE"] } },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { status: true },
            },
          },
        },
        speedGame: { select: { status: true } },
        _count: { select: { cards: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      classroomName: student.classroom?.name ?? null,
      boards: boards.map((board) => ({
        id: board.id,
        slug: board.slug,
        title: board.title || "제목 없음",
        layout: board.layout,
        category: board.category,
        anonymousAuthor: board.anonymousAuthor,
        thumbnailMode: board.thumbnailMode,
        thumbnailUrl: board.thumbnailUrl,
        boardTheme: board.boardTheme,
        streamSectionsEnabled: board.streamSectionsEnabled,
        cardCount: board._count.cards,
        quizzes: board.quizzes,
        kordleStatus:
          board.layout === "kordle"
            ? board.kordleGame?.puzzles[0]?.status ?? null
            : null,
        speedGameStatus:
          board.layout === "speed-game"
            ? board.speedGame?.status ?? "lobby"
            : null,
        shadowAllianceStatus:
          board.layout === "shadow-alliance" ? "waiting" : null,
      })),
    });
  } catch (error) {
    console.error("[GET /api/student/boards]", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
