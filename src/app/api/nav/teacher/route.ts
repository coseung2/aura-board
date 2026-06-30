import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";

const BOARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  category: true,
  classroomId: true,
  updatedAt: true,
} as const;

function toBoardSummary(board: {
  id: string;
  slug: string;
  title: string;
  category: string;
  classroomId: string | null;
  updatedAt: Date;
}) {
  return {
    id: board.id,
    slug: board.slug,
    title: board.title || "제목 없음",
    category: board.category,
    classroomId: board.classroomId,
    updatedAt: board.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const user = await getCurrentUser();

    const [classrooms, memberships] = await Promise.all([
      db.classroom.findMany({
        where: { teacherId: user.id },
        select: {
          id: true,
          name: true,
          boards: {
            select: BOARD_SELECT,
            orderBy: { updatedAt: "desc" },
            take: 12,
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.boardMember.findMany({
        where: { userId: user.id },
        select: { board: { select: BOARD_SELECT } },
        orderBy: { board: { updatedAt: "desc" } },
        take: 80,
      }),
    ]);

    const boardsById = new Map<
      string,
      ReturnType<typeof toBoardSummary>
    >();

    for (const membership of memberships) {
      boardsById.set(membership.board.id, toBoardSummary(membership.board));
    }

    const classroomSummaries = classrooms.map((classroom) => {
      const boards = classroom.boards.map((board) => {
        const summary = toBoardSummary(board);
        boardsById.set(summary.id, summary);
        return summary;
      });

      return {
        id: classroom.id,
        name: classroom.name,
        boards,
      };
    });

    const boards = Array.from(boardsById.values()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );

    return jsonPrivateNoStore({ classrooms: classroomSummaries, boards });
  } catch (error) {
    console.error("[GET /api/nav/teacher]", error);
    return jsonPrivateNoStore({ classrooms: [], boards: [] }, { status: 500 });
  }
}
