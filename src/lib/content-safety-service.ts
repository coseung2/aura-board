import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  CONTENT_TARGET_KINDS,
  buildHiddenLookup,
  buildContentSnapshot,
  type ContentTargetKind,
  type HiddenLookup,
} from "./content-safety";

// Database side of the UGC safety controls. Pure decisions live in
// ./content-safety; this module only loads and writes rows.

/**
 * Load one student's hide state.
 *
 * Both tables are small per student (a handful of rows in normal classroom
 * use), so a full per-student fetch is cheaper than filtering by target id on
 * every request and keeps the caller free to render any list.
 */
export async function loadHiddenLookup(studentId: string): Promise<HiddenLookup> {
  const rows = await db.$queryRaw<
    Array<{ targets: unknown; hidden_author_ids: unknown }>
  >(Prisma.sql`
    SELECT
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'targetKind', target."targetKind",
              'targetId', target."targetId"
            )
          )
          FROM "HiddenContent" AS target
          WHERE target."studentId" = ${studentId}
        ),
        '[]'::jsonb
      ) AS "targets",
      COALESCE(
        (
          SELECT jsonb_agg(author."hiddenStudentId")
          FROM "HiddenContentAuthor" AS author
          WHERE author."studentId" = ${studentId}
        ),
        '[]'::jsonb
      ) AS "hidden_author_ids"
  `);
  const targetKinds = new Set<string>(CONTENT_TARGET_KINDS);
  const hiddenTargets = Array.isArray(rows[0]?.targets)
    ? rows[0].targets.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const target = value as Record<string, unknown>;
        if (
          typeof target.targetKind !== "string" ||
          !targetKinds.has(target.targetKind) ||
          typeof target.targetId !== "string"
        ) {
          return [];
        }
        return [
          {
            targetKind: target.targetKind as ContentTargetKind,
            targetId: target.targetId,
          },
        ];
      })
    : [];
  const hiddenAuthorStudentIds = Array.isArray(rows[0]?.hidden_author_ids)
    ? rows[0].hidden_author_ids.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  return buildHiddenLookup({ hiddenTargets, hiddenAuthorStudentIds });
}

/**
 * Empty lookup for non-student actors. Teachers and parents see everything;
 * hiding is a per-student preference and must not alter moderation views.
 */
export function emptyHiddenLookup(): HiddenLookup {
  return buildHiddenLookup({ hiddenTargets: [], hiddenAuthorStudentIds: [] });
}

/** Idempotent per-item hide. Re-hiding an already hidden item is a no-op. */
export async function hideTarget(input: {
  studentId: string;
  targetKind: ContentTargetKind;
  targetId: string;
  viaReport?: boolean;
}): Promise<void> {
  const { studentId, targetKind, targetId, viaReport = false } = input;
  await db.hiddenContent.upsert({
    where: { studentId_targetKind_targetId: { studentId, targetKind, targetId } },
    // Never downgrade an existing report-driven hide to a manual one.
    update: viaReport ? { viaReport: true } : {},
    create: { studentId, targetKind, targetId, viaReport },
  });
}

/** Undo a per-item hide. Missing rows are treated as already unhidden. */
export async function unhideTarget(input: {
  studentId: string;
  targetKind: ContentTargetKind;
  targetId: string;
}): Promise<void> {
  const { studentId, targetKind, targetId } = input;
  await db.hiddenContent.deleteMany({ where: { studentId, targetKind, targetId } });
}

/** Author-level hide. Satisfies the App Store "block abusive users" control. */
export async function hideAuthor(input: {
  studentId: string;
  hiddenStudentId: string;
  reportId?: string | null;
}): Promise<void> {
  const { studentId, hiddenStudentId, reportId = null } = input;
  await db.hiddenContentAuthor.upsert({
    where: { studentId_hiddenStudentId: { studentId, hiddenStudentId } },
    update: reportId ? { reportId } : {},
    create: { studentId, hiddenStudentId, reportId },
  });
}

export async function unhideAuthor(input: {
  studentId: string;
  hiddenStudentId: string;
}): Promise<void> {
  await db.hiddenContentAuthor.deleteMany({
    where: { studentId: input.studentId, hiddenStudentId: input.hiddenStudentId },
  });
}

/**
 * Resolved report target: which classroom owns it, who wrote it, and a text
 * snapshot for the teacher queue.
 *
 * `authorStudentId` is null for teacher-authored and share-link content. Those
 * are still reportable; the teacher queue simply has no student to eject.
 */
export interface ResolvedReportTarget {
  classroomId: string;
  authorStudentId: string | null;
  authorLabel: string | null;
  contentSnapshot: string | null;
}

/**
 * Look up a report target and confirm it belongs to the reporting student's
 * classroom. Returns null when the target is missing or out of scope, so the
 * caller cannot be used to probe for content in other classrooms.
 */
export async function resolveReportTarget(input: {
  targetKind: ContentTargetKind;
  targetId: string;
  reporterClassroomId: string;
}): Promise<ResolvedReportTarget | null> {
  const { targetKind, targetId, reporterClassroomId } = input;

  if (targetKind === "card") {
    const card = await db.card.findUnique({
      where: { id: targetId },
      select: {
        title: true,
        content: true,
        studentAuthorId: true,
        studentAuthor: { select: { name: true } },
        board: { select: { classroomId: true } },
      },
    });
    if (!card?.board.classroomId) return null;
    if (card.board.classroomId !== reporterClassroomId) return null;
    return {
      classroomId: card.board.classroomId,
      authorStudentId: card.studentAuthorId,
      authorLabel: card.studentAuthor?.name ?? null,
      contentSnapshot: buildContentSnapshot([card.title, card.content].filter(Boolean).join(" · ")),
    };
  }

  const comment = await db.cardComment.findUnique({
    where: { id: targetId },
    select: {
      content: true,
      authorStudentId: true,
      authorStudent: { select: { name: true } },
      authorUser: { select: { name: true } },
      externalAuthorName: true,
      card: { select: { board: { select: { classroomId: true } } } },
    },
  });
  if (!comment?.card.board.classroomId) return null;
  if (comment.card.board.classroomId !== reporterClassroomId) return null;
  return {
    classroomId: comment.card.board.classroomId,
    authorStudentId: comment.authorStudentId,
    authorLabel:
      comment.authorStudent?.name ?? comment.authorUser?.name ?? comment.externalAuthorName ?? null,
    contentSnapshot: buildContentSnapshot(comment.content),
  };
}
