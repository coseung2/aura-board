import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { getEffectiveBoardRole } from "@/lib/rbac";
import { resolveCardAuthorLabels } from "@/lib/card-author-labels";
import { loadGameSnapshot } from "@/lib/speed-game/runtime";
import { sanitizeGameSnapshotForStudent } from "@/lib/speed-game/student-snapshot";
import { parseObservationPoints } from "@/lib/plant-schemas";

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
          // web 의 order 기반 정렬과 동일하게 유지하되 createdAt 으로 안정 정렬.
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
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
    let allowedBreakoutSectionIds: Set<string> | null = null;

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
                // Assignment submissions persist images on the materialized
                // slot card; expose that value through the submission-shaped
                // mobile DTO so previews survive a reload.
                imageUrl: slot.card.imageUrl,
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
      layoutData.plantRoadmap = {
        plants: plants.map((plant) => ({
          ...plant,
          species: {
            ...plant.species,
            stages: plant.species.stages.map((stage) => ({
              ...stage,
              observationPoints: parseObservationPoints(
                stage.observationPoints,
              ),
            })),
          },
        })),
      };
    }

    if (board.layout === "speed-game") {
      const game = await db.speedGame.findFirst({
        where: { boardId: board.id },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const snapshot = game ? await loadGameSnapshot(game.id) : null;
      layoutData.speedGame = {
        game: snapshot
          ? sanitizeGameSnapshotForStudent(snapshot, student.id)
          : null,
      };
    }

    if (board.layout === "event-signup") {
      layoutData.eventSignup = {
        accessMode: board.accessMode,
        accessToken:
          board.accessMode === "public-link" ? board.accessToken : null,
        applicationStart: board.applicationStart?.toISOString() ?? null,
        applicationEnd: board.applicationEnd?.toISOString() ?? null,
        eventPosterUrl: board.eventPosterUrl,
        venue: board.venue,
        maxSelections: board.maxSelections,
      };
    }

    if (board.layout === "breakout") {
      const assignment = await db.breakoutAssignment.findUnique({
        where: { boardId: board.id },
        include: { template: true },
      });
      if (assignment) {
        const structure = assignment.template.structure as {
          sharedSections?: Array<{ title: string }>;
        } | null;
        const sharedTitles = new Set(
          (structure?.sharedSections ?? []).map((section) => section.title),
        );
        const visibility =
          (assignment.visibilityOverride as
            | "own-only"
            | "peek-others"
            | null) ??
          (assignment.template.recommendedVisibility as
            | "own-only"
            | "peek-others");
        const memberships = await db.breakoutMembership.findMany({
          where: { assignmentId: assignment.id, studentId: student.id },
          select: { sectionId: true },
        });
        const ownIds = new Set(
          memberships.map((membership) => membership.sectionId),
        );
        const sharedIds = new Set(
          board.sections
            .filter((section) => sharedTitles.has(section.title))
            .map((section) => section.id),
        );
        allowedBreakoutSectionIds = new Set(
          board.sections
            .filter(
              (section) =>
                sharedTitles.has(section.title) ||
                visibility === "peek-others" ||
                ownIds.has(section.id),
            )
            .map((section) => section.id),
        );
        layoutData.breakout = {
          assignmentId: assignment.id,
          status: assignment.status,
          visibility,
          sectionIds: [...allowedBreakoutSectionIds],
          ownSectionIds: [...ownIds],
          writableSectionIds:
            assignment.status === "archived"
              ? []
              : [...new Set([...ownIds, ...sharedIds])],
        };
      } else {
        layoutData.breakout = null;
        allowedBreakoutSectionIds = new Set();
      }
    }

    const role = await getEffectiveBoardRole(board.id, {
      studentId: student.id,
    });
    const canControlQueue = role === "owner" || role === "editor";
    const layoutVisibleCards =
      board.layout === "dj-queue"
        ? board.cards.filter((card) => {
            if (!card.queueStatus) return false;
            if (canControlQueue) return true;
            return (
              card.queueStatus === "approved" ||
              card.queueStatus === "played" ||
              (card.queueStatus === "pending" &&
                card.studentAuthorId === student.id)
            );
          })
        : board.cards;
    const visibleCards = allowedBreakoutSectionIds
      ? layoutVisibleCards.filter(
          (card) =>
            card.sectionId !== null &&
            allowedBreakoutSectionIds.has(card.sectionId),
        )
      : layoutVisibleCards;
    const cards = await Promise.all(
      visibleCards.map(async (card) => {
        const { _count, ...rest } = card;
        const hasAuthor =
          rest.authors.length > 0 ||
          Boolean(
            rest.externalAuthorName || rest.authorId || rest.studentAuthorId,
          );
        // mobile parity: 카드 단위 권한을 서버에서 같이 내려주면 클라이언트가
        // 권한 분기를 로컬로 추정하지 않아도 된다. isMine / canEdit / canDelete
        // 는 본인 카드 수정/삭제 메뉴 노출에 직접 사용됨.
        const isMine =
          !!rest.studentAuthorId && rest.studentAuthorId === student.id;
        const isOwnPendingQueue = rest.queueStatus === "pending" && isMine;
        const canEdit = isMine;
        const canDelete = isMine;
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
          externalAuthorKey: board.anonymousAuthor
            ? null
            : rest.externalAuthorKey,
          externalAuthorName:
            board.anonymousAuthor && hasAuthor
              ? ANONYMOUS_AUTHOR_LABEL
              : rest.externalAuthorName,
          authors: board.anonymousAuthor ? [] : rest.authors,
          anonymousAuthor: board.anonymousAuthor,
          likeCount: _count.likes,
          commentCount: _count.comments,
          isMine,
          canEdit,
          canDelete,
          isOwnPendingQueue,
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
        assignmentDeadline: board.assignmentDeadline?.toISOString() ?? null,
        assignmentAllowLate: board.assignmentAllowLate,
        // 보드 썸네일/테마/스트림 섹션 토글 (2026-06-27 모바일 student DTO 확장).
        // 교사 보드 설정에서 저장된 값을 그대로 내려주며, 폴백 처리는 프론트에서 한다.
        thumbnailMode: board.thumbnailMode,
        thumbnailUrl: board.thumbnailUrl,
        boardTheme: board.boardTheme,
        streamSectionsEnabled: board.streamSectionsEnabled,
        _count: { cards: visibleCards.length },
      },
      cards,
      sections: allowedBreakoutSectionIds
        ? board.sections.filter((section) =>
            allowedBreakoutSectionIds.has(section.id),
          )
        : board.sections,
      currentStudent: {
        id: student.id,
        name: student.name,
        classroomId: student.classroomId,
      },
      capabilities: {
        canControlQueue,
        canAddCard: true,
        canEditOwnCard: true,
        canDeleteOwnCard: true,
      },
      layoutData,
    });
  } catch (e) {
    console.error("[GET /api/student/board/:slug]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
