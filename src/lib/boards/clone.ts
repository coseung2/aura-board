import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

/**
 * Layouts that the safe "teacher-owned copy" clone path supports.
 *
 * Shared by the internal duplicate API and the public share-clone API.
 * Specialized boards (assignment, quiz, drawing, breakout, assessment,
 * dj-queue, plant-roadmap, vibe-arcade, vibe-gallery, question-board, ...)
 * require layout-specific copy logic that this helper does not provide -
 * callers should return 400 `unsupported_layout` rather than producing a
 * broken shallow copy.
 */
export const SUPPORTED_CLONE_LAYOUTS = new Set<string>([
  "freeform",
  "grid",
  "stream",
  "columns",
]);

type Tx = Prisma.TransactionClient | PrismaClient;

export type BoardCloneSource = {
  id: string;
  slug: string;
  title: string;
  layout: string;
  description: string;
  thumbnailMode: string;
  thumbnailUrl: string | null;
  anonymousAuthor: boolean;
  eventPosterUrl: string | null;
  applicationStart: Date | null;
  applicationEnd: Date | null;
  eventStart: Date | null;
  eventEnd: Date | null;
  venue: string | null;
  maxSelections: number | null;
  videoPolicy: string;
  videoProviders: string;
  maxVideoDurationSec: number | null;
  maxVideoSizeMb: number | null;
  allowTeam: boolean;
  maxTeamSize: number | null;
  customQuestions: string;
  announceMode: string;
  requireApproval: boolean;
  askName: boolean;
  askGradeClass: boolean;
  askStudentNumber: boolean;
  askContact: boolean;
  assignmentGuideText: string | null;
  assignmentAllowLate: boolean;
  assignmentDeadline: Date | null;
  questionPrompt: string | null;
  questionVizMode: string;
  streamTitlePrompt: string;
  streamContentPrompt: string;
  streamSectionsEnabled: boolean;
  boardTheme: string;
  auraEvaluationEnabled: boolean;
  auraSubject: string | null;
  auraUnit: string | null;
  auraCriterion: string | null;
  sections: Array<{
    id: string;
    title: string;
    order: number;
    pinned: boolean;
    sortMode: string | null;
    activityTemplate: string | null;
    activityTemplateState: Prisma.JsonValue | null;
  }>;
  cards: Array<{
    id: string;
    sectionId: string | null;
    authorId: string | null;
    studentAuthorId: string | null;
    externalAuthorName: string | null;
    externalAuthorKey: string | null;
    title: string;
    content: string;
    color: string | null;
    imageUrl: string | null;
    thumbUrl: string | null;
    linkUrl: string | null;
    linkTitle: string | null;
    linkDesc: string | null;
    linkImage: string | null;
    videoUrl: string | null;
    fileUrl: string | null;
    fileName: string | null;
    fileSize: number | null;
    fileMimeType: string | null;
    canvaDesignId: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    order: number;
    guidePinned: boolean;
    queueStatus: string | null;
    authors: Array<unknown>;
  }>;
};

export type BoardCloneOverrides = {
  /** Override the auto-generated slug (must be unique). */
  slug?: string;
  /** Override the auto-generated title. */
  title?: string;
};

/**
 * Copy the safe "lesson / template" surface of `source` into a new board
 * owned by `ownerUserId`. Returns the newly-created board row.
 *
 * Excluded intentionally:
 *   - shareMode / shareToken / shareShortCode / accessToken - clone is
 *     private to the cloning user.
 *   - classroomId, default groups - personal copy, not classroom-shared.
 *   - student / external-authored cards and any CardAuthor rows.
 *   - engagement data: comments, likes, evaluations, asset attachments.
 *   - section `accessToken` - no public breakout link follows the copy.
 *
 * The caller is responsible for:
 *   - verifying the caller can view the source board (RBAC / share auth).
 *   - guarding the layout (callers should check
 *     `SUPPORTED_CLONE_LAYOUTS.has(source.layout)` and return 400
 *     `unsupported_layout` for anything else).
   *   - slug uniqueness when providing `overrides.slug`.
 */
export async function cloneTeacherBoard(
  tx: Tx,
  source: BoardCloneSource,
  ownerUserId: string,
  overrides: BoardCloneOverrides = {},
): Promise<{ id: string; slug: string; title: string; layout: string }> {
  const baseSlug =
    source.slug.replace(/[^a-zA-Z0-9-]+/g, "-") || "board";
  const slug =
    overrides.slug ?? `${baseSlug}-copy-${randomBytes(4).toString("hex")}`;
  const title =
    overrides.title ?? (source.title ? `${source.title} (복사본)` : "(복사본)");

  const created = await tx.board.create({
    data: {
      title,
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
      // Clone is a private personal copy: no share tokens, no classroom
      // link, no access token. The cloning teacher becomes the sole owner.
      shareMode: "private",
      shareToken: null,
      shareShortCode: null,
      accessToken: null,
      classroomId: null,
      members: {
        create: { userId: ownerUserId, role: "owner" },
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
        activityTemplateState:
          section.activityTemplateState === null
            ? undefined
            : (section.activityTemplateState as Prisma.InputJsonValue),
      },
    });
    sectionIdMap.set(section.id, createdSection.id);
  }

  if (source.cards.length === 0) {
    return {
      id: created.id,
      slug: created.slug,
      title: created.title,
      layout: created.layout,
    };
  }

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
  // (`authorId != null`) because legacy / unattributed cards are otherwise
  // indistinguishable from safe teacher material. CardAuthor rows are also
  // an exclusion signal - they encode student participation that must not
  // be carried over into a personal copy.
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
        authorId: ownerUserId,
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

  return {
    id: created.id,
    slug: created.slug,
    title: created.title,
    layout: created.layout,
  };
}
