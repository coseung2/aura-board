import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureAccountFor } from "@/lib/bank";
import { retryActivityRewardTransaction } from "@/lib/creatures/activity-rewards";
import { awardCappedPolicyReward, loadRewardPolicy } from "@/lib/reward-service";
import { getCurrentStudent } from "@/lib/student-auth";
import { StudentSubmitSchema } from "@/lib/assignment-schemas";
import type {
  AssignmentSubmissionStatus,
  AssignmentGradingStatus,
} from "@/lib/assignment-schemas";
import { canStudentSubmit, computeStudentSubmit } from "@/lib/assignment-state";
import { slotRowToDTO, SLOT_INCLUDE_DEFAULT } from "@/lib/assignment-api";
import {
  assignmentSubmissionRewardSourceRef,
  isAssignmentSubmissionOnTime,
} from "@/lib/assignment-submission";
import { assignmentChannelKey, publish } from "@/lib/realtime";
import { resizeToWebPThumbUrl } from "@/lib/blob";
import { touchBoardUpdatedAt } from "@/lib/board-touch";
import { dispatchLinkedParentCardPush } from "@/lib/parent-push";

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

type SubmissionResult = {
  updated: Parameters<typeof slotRowToDTO>[0] & { updatedAt: Date };
  attemptId: string;
  submittedAt: Date;
  submittedOnTime: boolean;
  rewardEligible: boolean;
  rewardAwarded: boolean;
  rewardAmount: number;
  idempotent: boolean;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: slotId } = await ctx.params;
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "student_auth_required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = StudentSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.issues[0]?.message },
      { status: 400 },
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
  const { idempotencyKey, content, linkUrl, fileUrl, imageUrl } = parsed.data;
  let thumbUrl: string | null | undefined;
  if (imageUrl !== undefined) {
    try {
      thumbUrl = await resizeToWebPThumbUrl(
        imageUrl,
        `assignment-thumbs/${slot.boardId}/${slot.cardId}.webp`,
      );
    } catch (error) {
      console.warn(`[AssignmentSlot] thumb generation failed slotId=${slot.id}`, error);
      thumbUrl = null;
    }
  }

  const { accountId } = await ensureAccountFor(student);
  let result: SubmissionResult;
  try {
    result = await retryActivityRewardTransaction(
      () =>
        db.$transaction(
          async (tx): Promise<SubmissionResult> => {
            const current = await tx.assignmentSlot.findUnique({
              where: { id: slot.id },
              select: {
                id: true,
                boardId: true,
                cardId: true,
                studentId: true,
                submissionStatus: true,
                gradingStatus: true,
                dueAt: true,
                submissionRevision: true,
                board: {
                  select: { assignmentAllowLate: true, assignmentDeadline: true },
                },
              },
            });
            if (!current) throw new SubmissionTransactionError("slot_not_found");
            if (current.studentId !== student.id) {
              throw new SubmissionTransactionError("slot_not_mine");
            }
            if (current.submissionStatus === "orphaned") {
              throw new SubmissionTransactionError("orphaned_slot");
            }

            const replayAttempt = await tx.assignmentSubmissionAttempt.findUnique({
              where: {
                assignmentSlotId_idempotencyKey: {
                  assignmentSlotId: current.id,
                  idempotencyKey,
                },
              },
            });
            if (replayAttempt) {
              const [replayedSlot, reward] = await Promise.all([
                tx.assignmentSlot.findUniqueOrThrow({
                  where: { id: current.id },
                  include: SLOT_INCLUDE_DEFAULT,
                }),
                tx.transaction.findFirst({
                  where: {
                    sourceType: "assignment_reward",
                    sourceRef: assignmentSubmissionRewardSourceRef(
                      student.id,
                      current.id,
                      replayAttempt.id,
                    ),
                    type: "deposit",
                  },
                  select: { amount: true },
                }),
              ]);
              return {
                updated: replayedSlot,
                attemptId: replayAttempt.id,
                submittedAt: replayAttempt.submittedAt,
                submittedOnTime: replayAttempt.submittedOnTime,
                rewardEligible: replayAttempt.submittedOnTime,
                rewardAwarded: reward !== null,
                rewardAmount: reward?.amount ?? 0,
                idempotent: true,
              };
            }

            // Evaluate the deadline only once this Serializable attempt is
            // ready to mutate. Preprocessing time must not make a request that
            // reaches the transaction late appear on time.
            const submittedAt = new Date();
            const currentAllowed = canStudentSubmit(
              {
                submissionStatus: current.submissionStatus as AssignmentSubmissionStatus,
                gradingStatus: current.gradingStatus as AssignmentGradingStatus,
              },
              {
                assignmentAllowLate: current.board.assignmentAllowLate,
                assignmentDeadline: current.board.assignmentDeadline,
                slotDueAt: current.dueAt,
              },
              submittedAt,
            );
            if (!currentAllowed) throw new SubmissionTransactionError("submission_locked");

            const transition = computeStudentSubmit(
              current.submissionStatus as AssignmentSubmissionStatus,
            );
            if (!transition.ok) throw new SubmissionTransactionError("invalid_transition");

            const submittedOnTime = isAssignmentSubmissionOnTime(current.dueAt, submittedAt);
            const revision = current.submissionRevision + 1;

            await tx.card.update({
              where: { id: current.cardId },
              data: {
                ...(content !== undefined ? { content } : {}),
                ...(linkUrl !== undefined ? { linkUrl } : {}),
                ...(imageUrl !== undefined ? { imageUrl } : {}),
                ...(thumbUrl !== undefined ? { thumbUrl } : {}),
              },
            });
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
                updatedAt: submittedAt,
              },
            });
            const attempt = await tx.assignmentSubmissionAttempt.create({
              data: {
                assignmentSlotId: current.id,
                idempotencyKey,
                revision,
                submittedAt,
                submittedOnTime,
              },
            });
            const next = await tx.assignmentSlot.update({
              where: { id: current.id },
              data: {
                submissionStatus: transition.next,
                submissionRevision: revision,
                ...(current.submissionStatus === "returned"
                  ? { gradingStatus: "not_graded", returnedAt: null, returnReason: null }
                  : {}),
              },
              include: SLOT_INCLUDE_DEFAULT,
            });

            let rewardAmount = 0;
            let rewardAwarded = false;
            if (submittedOnTime) {
              const policy = await loadRewardPolicy(tx, student.classroomId);
              const reward = await awardCappedPolicyReward({
                tx,
                studentId: student.id,
                classroomId: student.classroomId,
                accountId,
                area: "assignment",
                sourceRef: assignmentSubmissionRewardSourceRef(student.id, current.id, attempt.id),
                baseAmount: policy.assignmentRewardAmount,
                note: `과제 기한 내 제출 보상 [assignment-attempt:${attempt.id}]`,
                policy,
              });
              rewardAmount = reward?.amount ?? 0;
              rewardAwarded = reward !== null;
            }

            return {
              updated: next,
              attemptId: attempt.id,
              submittedAt,
              submittedOnTime,
              rewardEligible: submittedOnTime,
              rewardAwarded,
              rewardAmount,
              idempotent: false,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      3,
      async (error) => {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
          return false;
        }
        return Boolean(
          await db.assignmentSubmissionAttempt.findUnique({
            where: {
              assignmentSlotId_idempotencyKey: {
                assignmentSlotId: slot.id,
                idempotencyKey,
              },
            },
            select: { id: true },
          }),
        );
      },
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
    throw error;
  }

  if (!result.idempotent) {
    console.log(
      `[AssignmentSlot] transition slotId=${slot.id} from=${slot.submissionStatus} to=${result.updated.submissionStatus} actor=student actorId=${student.id}`,
    );
    await touchBoardUpdatedAt(slot.boardId);
    await publish({
      channel: assignmentChannelKey(slot.boardId),
      type: "slot.updated",
      payload: {
        slotId: result.updated.id,
        submissionStatus: result.updated.submissionStatus,
        gradingStatus: result.updated.gradingStatus,
        updatedAt: result.updated.updatedAt.toISOString(),
      },
    });
    await dispatchLinkedParentCardPush({
      eventKey: `assignment-attempt:${result.attemptId}`,
      studentId: student.id,
      studentName: student.name,
      boardId: slot.boardId,
      cardId: slot.cardId,
    });
  }

  return NextResponse.json({
    slot: slotRowToDTO(result.updated),
    submission: {
      attemptId: result.attemptId,
      submittedAt: result.submittedAt.toISOString(),
      submittedOnTime: result.submittedOnTime,
      rewardEligible: result.rewardEligible,
      rewardAwarded: result.rewardAwarded,
      rewardAmount: result.rewardAmount,
      idempotent: result.idempotent,
    },
  });
}
