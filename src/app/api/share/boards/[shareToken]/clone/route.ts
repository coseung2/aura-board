import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { authorizeShareAccess } from "@/lib/share/share-auth";

const SUPPORTED_CLONE_LAYOUTS = new Set([
  "freeform",
  "grid",
  "stream",
  "columns",
]);

/**
 * POST /api/share/boards/[shareToken]/clone
 *
 * Clones a board that is currently shared in "student" mode into the current
 * teacher's workspace. Only teacher-authored material is copied — student
 * cards (studentAuthorId / externalAuthorName / externalAuthorKey) and any
 * engagement / response data are intentionally skipped. Share tokens, event
 * public tokens, classroom membership and default groups are NOT carried over.
 *
 * Response:
 *   200 { board: { id, slug, title }, boardUrl }
 *   401 { error: "unauthorized" }
 *   404 { error: "share_not_found" }
 *   400 { error: "unsupported_layout" }
 *   500 { error: "internal" }
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ shareToken: string }> },
) {
  let user: Awaited<ReturnType<typeof getCurrentUser>> | null = null;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { shareToken } = await params;
  if (!shareToken) {
    return NextResponse.json({ error: "share_not_found" }, { status: 404 });
  }

  const auth = await authorizeShareAccess(shareToken, "student");
  if (!auth.ok) {
    return NextResponse.json({ error: "share_not_found" }, { status: 404 });
  }

  try {
    const source = await db.board.findUnique({
      where: { id: auth.boardId },
      include: {
        sections: { orderBy: { order: "asc" } },
        cards: {
          orderBy: { order: "asc" },
          include: { authors: true },
        },
      },
    });

    if (!source || source.shareMode !== "student") {
      return NextResponse.json({ error: "share_not_found" }, { status: 404 });
    }

    if (!SUPPORTED_CLONE_LAYOUTS.has(source.layout)) {
      return NextResponse.json({ error: "unsupported_layout" }, { status: 400 });
    }

    const baseSlug =
      (source.slug || "board").replace(/[^a-zA-Z0-9-]+/g, "-") || "board";
    const slug = `${baseSlug}-copy-${randomBytes(4).toString("hex")}`;
    const newTitle = source.title
      ? `${source.title} (복제본)`
      : "(복제본)";

    const newBoard = await db.$transaction(async (tx) => {
      const created = await tx.board.create({
        data: {
          title: newTitle,
          slug,
          layout: source.layout,
          description: source.description,
          thumbnailMode: source.thumbnailMode,
          thumbnailUrl: source.thumbnailUrl,
          anonymousAuthor: source.anonymousAuthor,
          eventPosterUrl: source.eventPosterUrl,
          applicationStart: source.applicationStart,
          applicationEnd: source.applicationEnd,
          eventStart: source.eventStart,
          eventEnd: source.eventEnd,
          venue: source.venue,
          maxSelections: source.maxSelections,
          videoPolicy: source.videoPolicy,
          videoProviders: source.videoProviders,
          maxVideoDurationSec: source.maxVideoDurationSec,
          maxVideoSizeMb: source.maxVideoSizeMb,
          allowTeam: source.allowTeam,
          maxTeamSize: source.maxTeamSize,
          customQuestions: source.customQuestions,
          announceMode: source.announceMode,
          requireApproval: source.requireApproval,
          askName: source.askName,
          askGradeClass: source.askGradeClass,
          askStudentNumber: source.askStudentNumber,
          askContact: source.askContact,
          assignmentGuideText: source.assignmentGuideText,
          assignmentAllowLate: source.assignmentAllowLate,
          assignmentDeadline: source.assignmentDeadline,
          questionPrompt: source.questionPrompt,
          questionVizMode: source.questionVizMode,
          streamTitlePrompt: source.streamTitlePrompt,
          streamContentPrompt: source.streamContentPrompt,
          streamSectionsEnabled: source.streamSectionsEnabled,
          boardTheme: source.boardTheme,
          auraEvaluationEnabled: source.auraEvaluationEnabled,
          auraSubject: source.auraSubject,
          auraUnit: source.auraUnit,
          auraCriterion: source.auraCriterion,
          // shareMode/shareToken/shareShortCode/accessToken intentionally null:
          // a clone starts private and belongs to the cloning teacher only.
          shareMode: "private",
          shareToken: null,
          shareShortCode: null,
          accessToken: null,
          // Do NOT carry over classroomId — clone is a personal copy, not a
          // classroom-shared artifact.
          classroomId: null,
          members: {
            create: { userId: user!.id, role: "owner" },
          },
        },
      });

      const sectionIdMap = new Map<string, string>();
      for (const section of source.sections) {
        const createdSection = await tx.section.create({
          data: {
            boardId: created.id,
            title: section.title,
            order: section.order,
            pinned: section.pinned,
            sortMode: section.sortMode,
            activityTemplate: section.activityTemplate,
            activityTemplateState: section.activityTemplateState ?? undefined,
            // accessToken intentionally omitted — no public breakout link.
          },
        });
        sectionIdMap.set(section.id, createdSection.id);
      }

      if (source.cards.length === 0) return created;

      // Pull all attachments in one query and key by source card id so we can
      // copy them under the new card ids without an N+1.
      const sourceCardIds = source.cards.map((c) => c.id);
      const sourceAttachments = await tx.cardAttachment.findMany({
        where: { cardId: { in: sourceCardIds } },
        orderBy: { order: "asc" },
      });
      const attachmentsByCard = new Map<string, typeof sourceAttachments>();
      for (const att of sourceAttachments) {
        const list = attachmentsByCard.get(att.cardId) ?? [];
        list.push(att);
        attachmentsByCard.set(att.cardId, list);
      }

      // Only copy teacher-authored material. Cards with any student/external
      // authorship signal are skipped. We require an explicit teacher author
      // because legacy/unattributed share cards are otherwise indistinguishable
      // from safe teacher material.
      const teacherCards = source.cards.filter(
        (c) =>
          !!c.authorId &&
          !c.studentAuthorId &&
          !c.externalAuthorName &&
          !c.externalAuthorKey &&
          c.authors.length === 0,
      );

      for (const card of teacherCards) {
        const createdCard = await tx.card.create({
          data: {
            boardId: created.id,
            sectionId: card.sectionId
              ? sectionIdMap.get(card.sectionId) ?? null
              : null,
            authorId: user!.id,
            title: card.title,
            content: card.content,
            color: card.color,
            imageUrl: card.imageUrl,
            thumbUrl: card.thumbUrl,
            linkUrl: card.linkUrl,
            linkTitle: card.linkTitle,
            linkDesc: card.linkDesc,
            linkImage: card.linkImage,
            videoUrl: card.videoUrl,
            fileUrl: card.fileUrl,
            fileName: card.fileName,
            fileSize: card.fileSize,
            fileMimeType: card.fileMimeType,
            canvaDesignId: card.canvaDesignId,
            x: card.x,
            y: card.y,
            width: card.width,
            height: card.height,
            order: card.order,
            guidePinned: card.guidePinned,
            queueStatus: card.queueStatus,
            studentAuthorId: null,
            externalAuthorName: null,
            externalAuthorKey: null,
            groupId: null,
          },
        });

        const cardAttachments = attachmentsByCard.get(card.id) ?? [];
        if (cardAttachments.length > 0) {
          await tx.cardAttachment.createMany({
            data: cardAttachments.map((att) => ({
              cardId: createdCard.id,
              kind: att.kind,
              url: att.url,
              previewUrl: att.previewUrl,
              fileName: att.fileName,
              fileSize: att.fileSize,
              mimeType: att.mimeType,
              order: att.order,
            })),
          });
        }
      }

      return created;
    });

    const boardUrl = `/board/${newBoard.slug || newBoard.id}`;
    return NextResponse.json({
      board: {
        id: newBoard.id,
        slug: newBoard.slug,
        title: newBoard.title,
      },
      boardUrl,
    });
  } catch (e) {
    console.error("[POST /api/share/boards/:shareToken/clone]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
