import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";

/**
 * 학생 모바일 앱 전용 — 보드 한 개를 layout-specific 데이터와 함께 묶어서 반환.
 * 웹쪽 getBoardDetail 로직의 모바일 경량 버전. 교사 편집 권한은 내려주지 않는다.
 *
 * Card-기반 레이아웃(freeform/grid/stream/columns/vibe-gallery/dj-queue 등)은
 * cards[] 만 있으면 렌더 가능. 특수 레이아웃은 layoutData 블록에 추가 fetch.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const student = await getCurrentStudent();
    if (!student) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const board = await db.board.findFirst({
      where: {
        OR: [{ id: slug }, { slug }],
        classroomId: student.classroomId,
      },
      include: {
        cards: {
          orderBy: { createdAt: "asc" },
          include: {
            attachments: { orderBy: { order: "asc" } },
            authors: { orderBy: { displayName: "asc" } },
            _count: {
              select: {
                likes: true,
                comments: { where: { deletedAt: null } },
              },
            },
          },
        },
        sections: { orderBy: { order: "asc" } },
      },
    });
    if (!board) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const layoutData: Record<string, unknown> = {};

    if (board.layout === "quiz") {
      const room = await db.quiz.findFirst({
        where: { boardId: board.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          roomCode: true,
          status: true,
          title: true,
        },
      });
      layoutData.quiz = { room };
    }

    if (board.layout === "assignment") {
      const slots = await db.assignmentSlot.findMany({
        where: { boardId: board.id },
        orderBy: { slotNumber: "asc" },
        include: {
          submission: true,
          card: true,
          student: { select: { id: true, name: true, number: true } },
        },
      });
      layoutData.assignment = { slots };
    }

    if (board.layout === "vibe-arcade") {
      const [config, projects] = await Promise.all([
        db.vibeArcadeConfig.findUnique({ where: { boardId: board.id } }),
        db.vibeProject.findMany({
          where: {
            boardId: board.id,
            OR: [
              { moderationStatus: "approved" },
              { authorStudentId: student.id },
            ],
          },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            updatedAt: true,
            thumbnailUrl: true,
            moderationStatus: true,
            authorStudentId: true,
          },
          take: 60,
        }),
      ]);
      layoutData.vibeArcade = {
        config: config
          ? {
              enabled: config.enabled,
              perStudentDailyTokenCap: config.perStudentDailyTokenCap,
              classroomDailyTokenPool: config.classroomDailyTokenPool,
            }
          : null,
        projects,
      };
    }

    if (board.layout === "plant-roadmap") {
      const plants = await db.studentPlant.findMany({
        where: {
          boardId: board.id,
          studentId: student.id,
        },
        include: {
          species: { include: { stages: { orderBy: { order: "asc" } } } },
          currentStage: true,
          observations: {
            orderBy: { observedAt: "desc" },
            take: 20,
            include: { images: true, stage: true },
          },
        },
      });
      layoutData.plantRoadmap = { plants };
    }

    return NextResponse.json({
      board: {
        id: board.id,
        slug: board.slug,
        title: board.title,
        layout: board.layout,
        description: board.description,
        classroomId: board.classroomId,
      },
      cards: board.cards.map((card) => {
        const { _count, ...rest } = card;
        return {
          ...rest,
          likeCount: _count.likes,
          commentCount: _count.comments,
          createdAt: card.createdAt.toISOString(),
          updatedAt: card.updatedAt.toISOString(),
        };
      }),
      sections: board.sections,
      currentStudent: {
        id: student.id,
        name: student.name,
        classroomId: student.classroomId,
      },
      layoutData,
    });
  } catch (e) {
    console.error("[GET /api/student/board/:slug]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
