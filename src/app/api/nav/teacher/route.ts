import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { availableLayoutKeys, canUseProductFeature } from "@/lib/product-release";
import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { OFFICIAL_GAME_CATALOG, GAME_HUB_ORDER } from "@/lib/game-platform/catalog";
import { OFFICIAL_GAME_KINDS } from "@/lib/game-platform/contracts";

const BOARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  category: true,
  classroomId: true,
  updatedAt: true,
  layout: true,
  systemGameKind: true,
} as const;

function toBoardSummary(board: {
  id: string;
  slug: string;
  title: string;
  category: string;
  classroomId: string | null;
  updatedAt: Date;
  layout?: string | null;
  systemGameKind?: string | null;
}) {
  return {
    id: board.id,
    slug: board.slug,
    title: board.title || "제목 없음",
    category: board.category,
    classroomId: board.classroomId,
    updatedAt: board.updatedAt.toISOString(),
    layout: board.layout ?? null,
    systemGameKind: board.systemGameKind ?? null,
  };
}

function officialPlaySummaries(
  classroomId: string,
  rooms: Array<{
    id: string;
    slug: string;
    layout: string;
    classroomId: string | null;
    systemGameKind: string | null;
  }>,
) {
  const byKind = new Map(
    rooms
      .filter((room) => room.systemGameKind)
      .map((room) => [room.systemGameKind as string, room]),
  );
  const now = new Date().toISOString();
  return GAME_HUB_ORDER.map((kind) => {
    const room = byKind.get(kind);
    const catalog = OFFICIAL_GAME_CATALOG[kind];
    if (room) {
      return {
        id: room.id,
        slug: room.slug,
        title: catalog.label,
        category: "PLAY" as const,
        classroomId,
        updatedAt: now,
        layout: kind,
        systemGameKind: kind,
      };
    }
    return {
      id: `pending-${classroomId}-${kind}`,
      slug: `pending-${classroomId}-${kind}`,
      title: catalog.label,
      category: "PLAY" as const,
      classroomId,
      updatedAt: now,
      layout: kind,
      systemGameKind: kind,
      pending: true,
    };
  });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    const audience = { isAdmin: isAdminEmail(user.email) };
    const layouts = availableLayoutKeys(audience).filter((key) => !(OFFICIAL_GAME_KINDS as readonly string[]).includes(key));
    const canPlay = canUseProductFeature("play", audience);

    const [classrooms, memberships] = await Promise.all([
      db.classroom.findMany({
        where: { teacherId: user.id },
        select: {
          id: true,
          name: true,
          boards: {
            where: { layout: { in: layouts } },
            select: BOARD_SELECT,
            orderBy: { updatedAt: "desc" },
            take: 12,
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.boardMember.findMany({
        where: {
          userId: user.id,
          board: { layout: { in: layouts } },
        },
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

    const classroomIds = classrooms.map((classroom) => classroom.id);
    const officialRooms = canPlay && classroomIds.length
      ? await db.board.findMany({
          where: {
            classroomId: { in: classroomIds },
            systemGameKind: { in: [...OFFICIAL_GAME_KINDS] },
          },
          select: {
            id: true,
            slug: true,
            layout: true,
            classroomId: true,
            systemGameKind: true,
          },
        })
      : [];
    const officialByClassroom = new Map<string, typeof officialRooms>();
    for (const room of officialRooms) {
      if (!room.classroomId) continue;
      const list = officialByClassroom.get(room.classroomId) ?? [];
      list.push(room);
      officialByClassroom.set(room.classroomId, list);
    }

    const classroomSummaries = classrooms.map((classroom) => {
      const lessonBoards = classroom.boards.map((board) => {
        const summary = toBoardSummary(board);
        boardsById.set(summary.id, summary);
        return summary;
      });
      const playBoards = canPlay ? officialPlaySummaries(
        classroom.id,
        officialByClassroom.get(classroom.id) ?? [],
      ) : [];
      for (const board of playBoards) {
        if (!board.id.startsWith("pending-")) {
          boardsById.set(board.id, board);
        }
      }

      return {
        id: classroom.id,
        name: classroom.name,
        boards: [...lessonBoards, ...playBoards],
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
