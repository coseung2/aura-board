import "server-only";

import { db } from "@/lib/db";
import {
  DailyBannerSubmissionPayload,
  dateToKstDay,
  serializeDailyBannerSubmission,
} from "@/lib/daily-banner";

export class DailyBannerModerationError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "forbidden"
      | "already_rejected"
      | "not_pending"
      | "publication_missing"
      | "day_already_published",
    public readonly status: number,
  ) {
    super(code);
    this.name = "DailyBannerModerationError";
  }
}

type ModerationResult = {
  submission: DailyBannerSubmissionPayload;
  publication: {
    id: string;
    day: string;
    submissionId: string;
    approvedById: string;
    publishedAt: string;
  } | null;
  idempotent: boolean;
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function serializePublication(row: {
  id: string;
  day: Date;
  submissionId: string;
  approvedById: string;
  publishedAt: Date;
}) {
  return {
    id: row.id,
    day: dateToKstDay(row.day),
    submissionId: row.submissionId,
    approvedById: row.approvedById,
    publishedAt: row.publishedAt.toISOString(),
  };
}

async function loadSubmissionForTeacher(submissionId: string, classroomId: string, reviewerId: string) {
  const submission = await db.dailyBannerSubmission.findUnique({
    where: { id: submissionId },
    include: {
      classroom: { select: { id: true, teacherId: true } },
      student: { select: { classroomId: true } },
    },
  });
  if (
    !submission ||
    submission.classroomId !== classroomId ||
    (submission.student && submission.student.classroomId !== classroomId)
  ) {
    throw new DailyBannerModerationError("not_found", 404);
  }
  if (submission.classroom.teacherId !== reviewerId) {
    throw new DailyBannerModerationError("forbidden", 403);
  }
  return submission;
}

/**
 * Approve a submission and publish it globally for its target day.
 *
 * The status transition and publication insert are one transaction. The
 * publication table's unique day is the global race gate: if another teacher
 * wins the day, this transaction rolls back to pending and returns a 409.
 */
export async function approveDailyBannerSubmission(input: {
  submissionId: string;
  classroomId: string;
  reviewerId: string;
}): Promise<ModerationResult> {
  const selected = await loadSubmissionForTeacher(
    input.submissionId,
    input.classroomId,
    input.reviewerId,
  );

  try {
    return await db.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.dailyBannerSubmission.updateMany({
        where: { id: selected.id, status: "pending" },
        data: {
          status: "approved",
          reviewedAt: now,
          reviewedById: input.reviewerId,
          rejectionReason: null,
        },
      });

      if (changed.count === 0) {
        const latest = await tx.dailyBannerSubmission.findUnique({
          where: { id: selected.id },
          include: { publication: true },
        });
        if (!latest) {
          throw new DailyBannerModerationError("not_found", 404);
        }
        if (latest.status === "approved" && latest.publication) {
          return {
            submission: serializeDailyBannerSubmission(latest),
            publication: serializePublication(latest.publication),
            idempotent: true,
          };
        }
        if (latest.status === "rejected") {
          throw new DailyBannerModerationError("already_rejected", 409);
        }
        throw new DailyBannerModerationError("publication_missing", 409);
      }

      const publication = await tx.dailyBannerPublication.create({
        data: {
          day: selected.targetDay,
          submissionId: selected.id,
          approvedById: input.reviewerId,
        },
      });
      const approved = await tx.dailyBannerSubmission.findUniqueOrThrow({
        where: { id: selected.id },
      });

      return {
        submission: serializeDailyBannerSubmission(approved),
        publication: serializePublication(publication),
        idempotent: false,
      };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    // A duplicate approval for the same submission may race its first call.
    // Once the winning transaction commits, returning its publication makes
    // the operation idempotent. Otherwise the day was won by another row.
    const ownPublication = await db.dailyBannerPublication.findUnique({
      where: { submissionId: selected.id },
    });
    if (ownPublication) {
      const submission = await db.dailyBannerSubmission.findUniqueOrThrow({
        where: { id: selected.id },
      });
      return {
        submission: serializeDailyBannerSubmission(submission),
        publication: serializePublication(ownPublication),
        idempotent: true,
      };
    }
    throw new DailyBannerModerationError("day_already_published", 409);
  }
}

/** Reject a pending submission. Repeating the same rejection is idempotent. */
export async function rejectDailyBannerSubmission(input: {
  submissionId: string;
  classroomId: string;
  reviewerId: string;
  reason: string | null;
}): Promise<{ submission: DailyBannerSubmissionPayload; idempotent: boolean }> {
  const selected = await loadSubmissionForTeacher(
    input.submissionId,
    input.classroomId,
    input.reviewerId,
  );
  const now = new Date();
  const changed = await db.dailyBannerSubmission.updateMany({
    where: { id: selected.id, status: "pending" },
    data: {
      status: "rejected",
      reviewedAt: now,
      reviewedById: input.reviewerId,
      rejectionReason: input.reason,
    },
  });
  if (changed.count === 0) {
    const latest = await db.dailyBannerSubmission.findUnique({ where: { id: selected.id } });
    if (!latest) throw new DailyBannerModerationError("not_found", 404);
    if (latest.status === "rejected") {
      return { submission: serializeDailyBannerSubmission(latest), idempotent: true };
    }
    if (latest.status === "approved") {
      throw new DailyBannerModerationError("not_pending", 409);
    }
    throw new DailyBannerModerationError("not_pending", 409);
  }
  const rejected = await db.dailyBannerSubmission.findUniqueOrThrow({
    where: { id: selected.id },
  });
  return { submission: serializeDailyBannerSubmission(rejected), idempotent: false };
}
