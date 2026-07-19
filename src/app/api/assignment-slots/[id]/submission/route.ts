import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureAccountFor } from "@/lib/bank";
import {
  assignmentRewardSourceRef,
  isFirstAssignmentSubmission,
  retryActivityRewardTransaction,
} from "@/lib/creatures/activity-rewards";
import { awardCappedPolicyReward, loadRewardPolicy } from "@/lib/reward-service";
import { getCurrentStudent } from "@/lib/student-auth";
import { StudentSubmitSchema } from "@/lib/assignment-schemas";
import type {
  AssignmentSubmissionStatus,
  AssignmentGradingStatus,
} from "@/lib/assignment-schemas";
import { canStudentSubmit, computeStudentSubmit } from "@/lib/assignment-state";
import { slotRowToDTO, SLOT_INCLUDE_DEFAULT } from "@/lib/assignment-api";
import { assignmentChannelKey, publish } from "@/lib/realtime";
import { resizeToWebPThumbUrl } from "@/lib/blob";
import { touchBoardUpdatedAt } from "@/lib/board-touch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

class SubmissionTransactionError extends Error {
  constructor(
    public readonly code:
      | "slot_not_found"
      | "slot_not_mine"
      | "orphaned_slot"
      | "submission_locked"
      | "invalid_transition",
  ) {
    super(code);
    this.name = "SubmissionTransactionError";
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: slotId } = await ctx.params;
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "student_auth_required" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = StudentSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }

  const slot = await db.assignmentSlot.findUnique({
    where: { id: slotId },
    include: {
      board: {
        select: { id: true, assignmentAllowLate: true, assignmentDeadline: true },
      },
    },
  });
  if (!slot) return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  if (slot.studentId !== student.id) {
    return NextResponse.json({ error: "slot_not_mine" }, { status: 403 });
  }
  if (slot.submissionStatus === "orphaned") {
    return NextResponse.json({ error: "orphaned_slot" }, { status: 409 });
  }
  const allowed = canStudentSubmit(
    {
      submissionStatus: slot.submissionStatus as AssignmentSubmissionStatus,
      gradingStatus: slot.gradingStatus as AssignmentGradingStatus,
    },
    {
      assignmentAllowLate: slot.board.assignmentAllowLate,
      assignmentDeadline: slot.board.assignmentDeadline,
    }
  );
  if (!allowed) {
    return NextResponse.json({ error: "submission_locked" }, { status: 403 });
  }

  const initialTransition = computeStudentSubmit(slot.submissionStatus as AssignmentSubmissionStatus);
  if (!initialTransition.ok) {
    return NextResponse.json({ error: "invalid_transition" }, { status: 409 });
  }

  const { content, linkUrl, fileUrl, imageUrl } = parsed.data;
  const now = new Date();

  // AC-12: when the student submits a new imageUrl, derive a 160×120 WebP
  // thumbnail and persist it alongside. Failure is non-fatal — we fall
  // back to null so slotRowToDTO will serve the original imageUrl.
  let thumbUrl: string | null | undefined = undefined;
  if (imageUrl !== undefined) {
    try {
      thumbUrl = await resizeToWebPThumbUrl(
        imageUrl,
        `assignment-thumbs/${slot.boardId}/${slot.cardId}.webp`
      );
    } catch (e) {
      console.warn(
        `[AssignmentSlot] thumb generation failed slotId=${slot.id}`,
        e
      );
      thumbUrl = null;
    }
  }

  // Resolve server-owned wallet identity and policy before entering the
  // mutation transaction. The reward helper re-checks account ownership in
  // the same transaction before changing balance.
  const { accountId } = await ensureAccountFor(student);
  const assignmentSourceRef = assignmentRewardSourceRef(student.id, slot.id);

  let updated: Parameters<typeof slotRowToDTO>[0] & { updatedAt: Date };
  try {
    updated = await retryActivityRewardTransaction(() =>
      db.$transaction(
        async (tx) => {
          // Re-read inside Serializable scope. This makes the first-submit
          // decision against the row that will actually be updated, so two
          // concurrent submissions cannot both earn the source reward.
          const current = await tx.assignmentSlot.findUnique({
            where: { id: slot.id },
            select: {
              id: true,
              boardId: true,
              cardId: true,
              studentId: true,
              submissionStatus: true,
              gradingStatus: true,
              board: {
                select: {
                  assignmentAllowLate: true,
                  assignmentDeadline: true,
                },
              },
              submission: { select: { id: true } },
            },
          });
          if (!current) throw new SubmissionTransactionError("slot_not_found");
          if (current.studentId !== student.id) {
            throw new SubmissionTransactionError("slot_not_mine");
          }
          if (current.submissionStatus === "orphaned") {
            throw new SubmissionTransactionError("orphaned_slot");
          }

          const currentAllowed = canStudentSubmit(
            {
              submissionStatus: current.submissionStatus as AssignmentSubmissionStatus,
              gradingStatus: current.gradingStatus as AssignmentGradingStatus,
            },
            {
              assignmentAllowLate: current.board.assignmentAllowLate,
              assignmentDeadline: current.board.assignmentDeadline,
            },
          );
          if (!currentAllowed) {
            throw new SubmissionTransactionError("submission_locked");
          }

          const currentTransition = computeStudentSubmit(
            current.submissionStatus as AssignmentSubmissionStatus,
          );
          if (!currentTransition.ok) {
            throw new SubmissionTransactionError("invalid_transition");
          }

          const firstSubmission = isFirstAssignmentSubmission({
            submissionStatus: current.submissionStatus,
            hasExistingSubmission: current.submission !== null,
          });

          await tx.card.update({
            where: { id: current.cardId },
            data: {
              ...(content !== undefined ? { content } : {}),
              ...(linkUrl !== undefined ? { linkUrl } : {}),
              ...(imageUrl !== undefined ? { imageUrl } : {}),
              ...(thumbUrl !== undefined ? { thumbUrl } : {}),
            },
          });

          // Submission.userId stays null for student submissions —
          // assignmentSlotId is the canonical identity anchor (NextAuth User
          // ≠ Student row).
          await tx.submission.upsert({
            where: { assignmentSlotId: current.id },
            create: {
              boardId: current.boardId,
              userId: null,
              assignmentSlotId: current.id,
              content: content ?? "",
              linkUrl: linkUrl ?? null,
              fileUrl: fileUrl ?? null,
              status: "submitted",
            },
            update: {
              content: content ?? "",
              linkUrl: linkUrl ?? null,
              fileUrl: fileUrl ?? null,
              status: "submitted",
              updatedAt: now,
            },
          });

          const next = await tx.assignmentSlot.update({
            where: { id: current.id },
            data: {
              submissionStatus: currentTransition.next,
              // Reset grading state when the student resubmits after a
              // return, matching data_model.md §1.4.
              ...(current.submissionStatus === "returned"
                ? { gradingStatus: "not_graded", returnedAt: null, returnReason: null }
                : {}),
            },
            include: SLOT_INCLUDE_DEFAULT,
          });

          if (firstSubmission) {
            const policy = await loadRewardPolicy(tx, student.classroomId);
            await awardCappedPolicyReward({
              tx,
              studentId: student.id,
              classroomId: student.classroomId,
              accountId,
              area: "assignment",
              sourceRef: assignmentSourceRef,
              baseAmount: policy.assignmentRewardAmount,
              note: `과제 첫 제출 보상 [assignment-slot:${slot.id}]`,
              policy,
            });
          }

          return next;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  } catch (error) {
    if (error instanceof SubmissionTransactionError) {
      const status =
          error.code === "slot_not_found"
          ? 404
          : error.code === "slot_not_mine"
            ? 403
            : error.code === "orphaned_slot"
              ? 409
            : error.code === "submission_locked"
              ? 403
              : 409;
      return NextResponse.json({ error: error.code }, { status });
    }

    // If a concurrent first submission won the source unique index, resolve
    // the committed slot after the failed transaction. Any unrelated P2002
    // remains an internal error rather than being mistaken for a replay.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await db.transaction.findFirst({
        where: {
          accountId,
          sourceType: "assignment_reward",
          sourceRef: assignmentSourceRef,
          type: "deposit",
        },
        select: { id: true },
      });
      if (raced) {
        const committed = await db.assignmentSlot.findUnique({
          where: { id: slot.id },
          include: SLOT_INCLUDE_DEFAULT,
        });
        // The reward source is created in the same transaction as the first
        // submit. Only treat this as a replay when that winner also committed
        // the requested slot transition; otherwise preserve the original
        // P2002 instead of claiming a partial success.
        if (committed?.submissionStatus === "submitted" && committed.submission) {
          updated = committed;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  console.log(
    `[AssignmentSlot] transition slotId=${slot.id} from=${slot.submissionStatus} to=${updated.submissionStatus} actor=student actorId=${student.id}`
  );

  // classroom-boards-tab "🟢 새 활동" 배지 — 과제 제출로 slot card 내용 변경.
  await touchBoardUpdatedAt(slot.boardId);

  await publish({
    channel: assignmentChannelKey(slot.boardId),
    type: "slot.updated",
    payload: {
      slotId: updated.id,
      submissionStatus: updated.submissionStatus,
      gradingStatus: updated.gradingStatus,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });

  return NextResponse.json({ slot: slotRowToDTO(updated) });
}
