import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";
import { resolveCardAuthorLabels } from "@/lib/card-author-labels";

const ANONYMOUS_AUTHOR_LABEL = "익명";

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
          submission: {
            select: {
              id: true,
              content: true,
              fileUrl: true,
              linkUrl: true,
              createdAt: true,
            },
          },
          card: {
            select: {
              id: true,
              title: true,
              content: true,
              imageUrl: true,
              linkUrl: true,
              fileUrl: true,
            },
          },
          student: { select: { id: true, name: true, number: true } },
        },
      });
      layoutData.assignment = {
        slots: slots.map((slot) => ({
          ...slot,
          submission: slot.submission
            ? {
                id: slot.submission.id,
                content: slot.submission.content,
                imageUrl: null,
                fileUrl: slot.submission.fileUrl,
                linkUrl: slot.submission.linkUrl,
                submittedAt: slot.submission.createdAt.toISOString(),
              }
            : null,
        })),
      };
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
        projects: board.anonymousAuthor
          ? projects.map((project) => ({ ...project, authorStudentId: null }))
          : projects,
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

    const role = await getEffectiveBoardRole(board.id, { studentId: student.id });
    const canControlQueue = role === "owner" || role === "editor";
    const cards = await Promise.all(
      board.cards.map(async (card) => {
        const { _count, ...rest } = card;
        const hasAuthor =
          rest.authors.length > 0 ||
          Boolean(rest.externalAuthorName || rest.authorId || rest.studentAuthorId);
        const visibleAuthorLabels = board.anonymousAuthor
          ? hasAuthor
            ? {
              authorName: ANONYMOUS_AUTHOR_LABEL,
              studentAuthorName: null,
            }
            : { authorName: null, studentAuthorName: null }
          : await resolveCardAuthorLabels(card);
        return {
          ...rest,
          ...visibleAuthorLabels,
          authorId: board.anonymousAuthor ? null : rest.authorId,
          studentAuthorId: board.anonymousAuthor ? null : rest.studentAuthorId,
          externalAuthorKey: board.anonymousAuthor ? null : rest.externalAuthorKey,
          externalAuthorName:
            board.anonymousAuthor && hasAuthor
              ? ANONYMOUS_AUTHOR_LABEL
              : rest.externalAuthorName,
          authors: board.anonymousAuthor ? [] : rest.authors,
          anonymousAuthor: board.anonymousAuthor,
          likeCount: _count.likes,
          commentCount: _count.comments,
          createdAt: card.createdAt.toISOString(),
          updatedAt: card.updatedAt.toISOString(),
        };
      }),
    );

    return NextResponse.json({
      board: {
        id: board.id,
        slug: board.slug,
        title: board.title,
        layout: board.layout,
        description: board.description,
        classroomId: board.classroomId,
        anonymousAuthor: board.anonymousAuthor,
        _count: { cards: board.cards.length },
      },
      cards,
      sections: board.sections,
      currentStudent: {
        id: student.id,
        name: student.name,
        classroomId: student.classroomId,
      },
      capabilities: {
        canControlQueue,
      },
      layoutData,
    });
  } catch (e) {
    console.error("[GET /api/student/board/:slug]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
