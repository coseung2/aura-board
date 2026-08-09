import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureAccountOnlyFor } from "@/lib/bank";
import { isMeaningfulRewardComment } from "@/lib/reward-policy";
import {
  awardCappedPolicyReward,
  lockRewardAccount,
  loadPreparedCommentRewardContext,
  loadRewardPolicyCached,
} from "@/lib/reward-service";
import { dispatchParentNotificationPush } from "@/lib/parent-push";
import { dispatchStudentNotificationPush } from "@/lib/student-push";
import { getWalletTransactionDisplay } from "@/lib/wallet-transaction-display";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 5;
const MAX_ATTEMPTS = 8;
const LEASE_MS = 5 * 60 * 1_000;
const INCOMING_TRANSACTION_TYPES = new Set([
  "deposit",
  "refund",
  "fd_matured",
  "fd_cancelled",
  "slime_refund",
  "slime_item_refund",
  "correction_credit",
]);

export type ClaimedNotificationOutbox = {
  id: string;
  eventType: string;
  sourceId: string;
  payload: unknown;
  attempts: number;
  lockToken: string;
};

export type NotificationOutboxRun = {
  claimed: number;
  processed: number;
  retried: number;
  dead: number;
};

let activeConsumeBatch: Promise<NotificationOutboxRun> | null = null;

export async function claimNotificationOutbox(
  batchSize = DEFAULT_BATCH_SIZE,
  now = new Date(),
): Promise<ClaimedNotificationOutbox[]> {
  const take = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(batchSize)));
  const lockToken = randomUUID();
  const leaseExpiredBefore = new Date(now.getTime() - LEASE_MS);

  return db.$transaction((tx) => tx.$queryRaw<ClaimedNotificationOutbox[]>(
    Prisma.sql`
      WITH terminalized AS (
        UPDATE "NotificationOutbox"
        SET "status" = 'dead',
            "lockedAt" = NULL,
            "lockToken" = NULL,
            "lastError" = COALESCE("lastError", 'LeaseExpired'),
            "updatedAt" = ${now}
        WHERE "attempts" >= ${MAX_ATTEMPTS}
          AND (
            "status" = 'pending'
            OR ("status" = 'processing' AND "lockedAt" <= ${leaseExpiredBefore})
          )
        RETURNING "id"
      ), candidates AS (
        SELECT "id"
        FROM "NotificationOutbox"
        WHERE "attempts" < ${MAX_ATTEMPTS}
          AND (
            ("status" = 'pending' AND "nextAttemptAt" <= ${now})
            OR ("status" = 'processing' AND "lockedAt" <= ${leaseExpiredBefore})
          )
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${take}
      )
      UPDATE "NotificationOutbox" outbox
      SET "status" = 'processing',
          "attempts" = outbox."attempts" + 1,
          "lockedAt" = ${now},
          "lockToken" = ${lockToken},
          "updatedAt" = ${now}
      FROM candidates
      WHERE outbox."id" = candidates."id"
      RETURNING outbox."id", outbox."eventType", outbox."sourceId",
                outbox."payload", outbox."attempts", outbox."lockToken"
    `,
  ));
}

export async function consumeNotificationOutbox(options: {
  batchSize?: number;
  concurrency?: number;
  now?: Date;
} = {}): Promise<NotificationOutboxRun> {
  if (activeConsumeBatch) return activeConsumeBatch;
  const batch = consumeNotificationOutboxBatch(options);
  activeConsumeBatch = batch;
  try {
    return await batch;
  } finally {
    if (activeConsumeBatch === batch) activeConsumeBatch = null;
  }
}

async function consumeNotificationOutboxBatch(options: {
  batchSize?: number;
  concurrency?: number;
  now?: Date;
}): Promise<NotificationOutboxRun> {
  const now = options.now ?? new Date();
  const claimed = await claimNotificationOutbox(options.batchSize, now);
  const result: NotificationOutboxRun = {
    claimed: claimed.length,
    processed: 0,
    retried: 0,
    dead: 0,
  };
  const concurrency = Math.max(
    1,
    Math.min(10, Math.trunc(options.concurrency ?? DEFAULT_CONCURRENCY)),
  );

  await mapWithConcurrency(claimed, concurrency, async (event) => {
    try {
      await processNotificationOutboxEvent(event);
      const completed = await db.notificationOutbox.updateMany({
        where: { id: event.id, lockToken: event.lockToken, status: "processing" },
        data: {
          status: "done",
          processedAt: now,
          lockedAt: null,
          lockToken: null,
          lastError: null,
        },
      });
      if (completed.count === 1) result.processed += 1;
    } catch (error) {
      const terminal = event.attempts >= MAX_ATTEMPTS;
      const failed = await db.notificationOutbox.updateMany({
        where: { id: event.id, lockToken: event.lockToken, status: "processing" },
        data: {
          status: terminal ? "dead" : "pending",
          nextAttemptAt: terminal
            ? now
            : new Date(now.getTime() + notificationRetryDelayMs(event.attempts)),
          lockedAt: null,
          lockToken: null,
          lastError: safeOutboxError(error),
        },
      });
      if (failed.count === 1) {
        if (terminal) result.dead += 1;
        else result.retried += 1;
      }
    }
  });

  return result;
}

export function notificationRetryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(7, Math.trunc(attempts) - 1));
  return Math.min(60 * 60 * 1_000, 30_000 * (2 ** exponent));
}

async function processNotificationOutboxEvent(
  event: ClaimedNotificationOutbox,
): Promise<void> {
  switch (event.eventType) {
    case "card_like":
      await processCardLike(event.sourceId);
      return;
    case "card_comment":
      await processCardComment(event.sourceId);
      return;
    case "comment_reward":
      await processCardCommentReward(event.sourceId, event.payload);
      return;
    case "transaction":
      await processTransaction(event.sourceId);
      return;
    case "parent_link":
      await processParentLink(event.sourceId);
      return;
    case "assignment_slot":
      await processAssignmentSlot(event.sourceId);
      return;
    default:
      throw new Error("unsupported_notification_outbox_event");
  }
}

async function processCardLike(sourceId: string): Promise<void> {
  const like = await db.cardLike.findUnique({
    where: { id: sourceId },
    include: {
      card: {
        select: {
          id: true,
          title: true,
          studentAuthorId: true,
          authors: { select: { studentId: true } },
          board: { select: { slug: true, title: true, anonymousAuthor: true } },
        },
      },
    },
  });
  if (!like || !["teacher", "student", "external"].includes(like.likerKind)) return;

  const bucketMs = 5 * 60 * 1_000;
  const bucketStartMs = Math.floor(like.createdAt.getTime() / bucketMs) * bucketMs;
  const bucketStart = new Date(bucketStartMs);
  const bucketEnd = new Date(bucketStartMs + bucketMs);
  const likes = await db.cardLike.findMany({
    where: {
      cardId: like.card.id,
      createdAt: { gte: bucketStart, lt: bucketEnd },
      likerKind: { in: ["teacher", "student", "external"] },
    },
    orderBy: { createdAt: "asc" },
    include: {
      likerUser: { select: { name: true } },
      likerStudent: { select: { name: true } },
    },
  });
  if (likes.length === 0) return;
  const digestKey = `like-digest:${like.card.id}:${bucketStart.toISOString()}`;
  await Promise.all(cardStudentIds(like.card).map(async (studentId) => {
    const recipientLikes = likes.filter((entry) => entry.likerStudentId !== studentId);
    if (recipientLikes.length === 0) return;
    const first = recipientLikes[0];
    const actorLabel = actorLabelFor(
      first.likerKind,
      first.likerKind === "teacher" ? first.likerUser?.name : first.likerStudent?.name,
      like.card.board.anonymousAuthor,
    );
    const count = recipientLikes.length;
    const title = count === 1
      ? "내 게시물에 좋아요가 눌렸어요"
      : `내 게시물이 좋아요 ${count}개를 받았어요`;
    const body = count === 1
      ? `${actorLabel}이(가) ${like.card.title || "내 게시물"}에 좋아요를 눌렀어요.`
      : `${actorLabel} 외 ${count - 1}명이 ${like.card.title || "내 게시물"}에 좋아요를 눌렀어요.`;
    await dispatchStudentNotificationPush({
      eventKey: digestKey,
      sourceId: digestKey,
      studentId,
      kind: "like",
      title,
      body,
      href: `/board/${like.card.board.slug}`,
      actorLabel,
      cardTitle: like.card.title || "내 게시물",
      boardTitle: like.card.board.title,
      content: body,
      createdAt: bucketEnd,
    }, { propagateFailure: true });
  }));
}

async function processCardComment(sourceId: string): Promise<void> {
  const comment = await db.cardComment.findUnique({
    where: { id: sourceId },
    include: {
      authorUser: { select: { name: true } },
      authorStudent: { select: { name: true } },
      parentComment: { select: { authorStudentId: true } },
      card: {
        select: {
          title: true,
          studentAuthorId: true,
          authors: { select: { studentId: true } },
          board: { select: { slug: true, title: true, anonymousAuthor: true } },
        },
      },
    },
  });
  if (!comment) return;

  if (comment.deletedAt) return;

  const actorLabel = actorLabelFor(
    comment.authorKind,
    comment.authorKind === "teacher"
      ? comment.authorUser?.name
      : comment.authorKind === "student"
        ? comment.authorStudent?.name
        : comment.externalAuthorName,
    comment.card.board.anonymousAuthor,
  );
  const content = truncate(comment.content, 72);
  const recipients = new Map<string, "comment" | "reply">();
  for (const studentId of cardStudentIds(comment.card)) {
    if (studentId !== comment.authorStudentId) recipients.set(studentId, "comment");
  }
  const parentAuthorId = comment.parentComment?.authorStudentId;
  if (parentAuthorId && parentAuthorId !== comment.authorStudentId) {
    recipients.set(parentAuthorId, "reply");
  }
  await Promise.all(Array.from(recipients, ([studentId, kind]) =>
    dispatchStudentNotificationPush({
      eventKey: `${kind}:${comment.id}`,
      sourceId: comment.id,
      studentId,
      kind,
      title: kind === "reply" ? "내 댓글에 새 답글이 달렸어요" : "게시물에 새 댓글이 달렸어요",
      body: kind === "reply"
        ? `${actorLabel}이(가) 내 댓글에 답글을 남겼어요. ${truncate(comment.content, 80)}`
        : `${actorLabel}이(가) 댓글을 남겼어요. ${truncate(comment.content, 80)}`,
      href: `/board/${comment.card.board.slug}`,
      actorLabel,
      cardTitle: comment.card.title || "내 게시물",
      boardTitle: comment.card.board.title,
      content,
      createdAt: comment.createdAt,
    }, { propagateFailure: true }),
  ));
}

type CommentRewardPayload = {
  version: 1;
  claimId: string;
  commentId: string;
  authorKind: string;
  authorStudentId: string | null;
  normalizedContent: string;
  occurredAt: Date;
};

function parseCommentRewardPayload(
  sourceId: string,
  payload: unknown,
): CommentRewardPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("invalid_comment_reward_payload");
  }
  const value = payload as Record<string, unknown>;
  const occurredAt = typeof value.occurredAt === "string"
    ? new Date(value.occurredAt)
    : null;
  if (
    value.version !== 1
    || typeof value.claimId !== "string"
    || value.claimId.length === 0
    || typeof value.commentId !== "string"
    || value.commentId !== sourceId
    || typeof value.authorKind !== "string"
    || (value.authorStudentId !== null && typeof value.authorStudentId !== "string")
    || typeof value.normalizedContent !== "string"
    // NFKC can expand compatibility characters beyond the route's 1,000-code
    // unit input limit. Keep a defensive server-owned payload bound without
    // dead-lettering a valid normalized comment.
    || value.normalizedContent.length > 32_000
    || !occurredAt
    || Number.isNaN(occurredAt.getTime())
  ) {
    throw new Error("invalid_comment_reward_payload");
  }
  return {
    version: 1,
    claimId: value.claimId,
    commentId: value.commentId,
    authorKind: value.authorKind,
    authorStudentId: value.authorStudentId as string | null,
    normalizedContent: value.normalizedContent,
    occurredAt,
  };
}

async function processCardCommentReward(
  sourceId: string,
  rawPayload: unknown,
): Promise<void> {
  const event = parseCommentRewardPayload(sourceId, rawPayload);
  if (event.authorKind !== "student" || !event.authorStudentId) return;
  const student = await db.student.findUnique({
    where: { id: event.authorStudentId },
    select: {
      id: true,
      classroomId: true,
      account: { select: { id: true, classroomId: true } },
    },
  });
  if (!student) return;

  const policy = await loadRewardPolicyCached(student.classroomId);
  if (!isMeaningfulRewardComment(
    event.normalizedContent,
    policy.commentMinMeaningfulLength,
  )) return;

  if (student.account && student.account.classroomId !== student.classroomId) {
    throw new Error("Student account classroom mismatch");
  }
  const accountId = student.account?.id
    ?? (await ensureAccountOnlyFor(student)).accountId;
  await db.$transaction(async (tx) => {
    // Acquire the per-wallet serialization lock in its own statement. Under
    // READ COMMITTED, the following statement then receives a fresh snapshot
    // that includes the preceding worker's committed cap/idempotency writes.
    await lockRewardAccount(tx, accountId);
    const prepared = await loadPreparedCommentRewardContext(tx, {
      accountId,
      studentId: student.id,
      classroomId: student.classroomId,
      normalizedContent: event.normalizedContent,
      policy,
      now: event.occurredAt,
      duplicateAlreadyClaimed: true,
    });
    if (prepared.duplicate) return;
    await awardCappedPolicyReward({
      tx,
      studentId: student.id,
      classroomId: student.classroomId,
      accountId,
      area: "comment",
      sourceRef: event.commentId,
      baseAmount: policy.commentRewardAmount,
      note: `댓글 작성 보상 [comment:${event.commentId}]`,
      policy,
      accountAlreadyVerified: true,
      preparedCounts: prepared.counts,
      preparedRewardContext: prepared.rewardContext,
      occurredAt: event.occurredAt,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

async function processTransaction(sourceId: string): Promise<void> {
  const transaction = await db.transaction.findUnique({
    where: { id: sourceId },
    include: {
      account: {
        select: {
          studentId: true,
          classroom: { select: { currency: { select: { unitLabel: true } } } },
        },
      },
    },
  });
  if (!transaction) return;

  const unit = transaction.account.classroom.currency?.unitLabel ?? "원";
  const amount = `${Math.abs(transaction.amount).toLocaleString("ko-KR")}${unit}`;
  const balance = `현재 잔액은 ${transaction.balanceAfter.toLocaleString("ko-KR")}${unit}이에요.`;
  const display = getWalletTransactionDisplay(transaction);
  const incoming = isIncomingTransaction(transaction.type);
  const title = incoming ? `${amount}이 들어왔어요` : `${amount}이 나갔어요`;
  const reason = display.noteLabel ?? display.typeLabel;
  const content = `${reason}${roEuroParticle(reason)} 처리됐어요. ${balance}`;
  await dispatchStudentNotificationPush({
    eventKey: `wallet:${transaction.id}`,
    sourceId: transaction.id,
    studentId: transaction.account.studentId,
    kind: "wallet",
    title,
    body: content,
    href: "/my/wallet",
    actorLabel: "내 통장",
    cardTitle: title,
    boardTitle: "내 통장",
    content,
    createdAt: transaction.createdAt,
  }, { propagateFailure: true });
}

async function processParentLink(sourceId: string): Promise<void> {
  const link = await db.parentChildLink.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      parentId: true,
      status: true,
      deletedAt: true,
      student: { select: { name: true, classroom: { select: { name: true } } } },
    },
  });
  if (!link || link.status !== "pending" || link.deletedAt) return;
  await dispatchParentNotificationPush({
    eventKey: `parent-link-pending:${link.id}`,
    parentId: link.parentId,
    title: "자녀 연결 승인 대기",
    body: `${link.student.classroom.name}의 ${link.student.name} 학생 연결 승인을 기다리고 있어요.`,
    data: { type: "parent_notification", href: "/(parent)/notifications" },
  }, { propagateFailure: true });
}

async function processAssignmentSlot(sourceId: string): Promise<void> {
  const slot = await db.assignmentSlot.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      studentId: true,
      submissionStatus: true,
      createdAt: true,
      board: { select: { slug: true, title: true } },
    },
  });
  if (!slot || slot.submissionStatus !== "assigned") return;
  const title = "새 과제가 도착했어요";
  const body = `${slot.board.title || "과제 보드"} 과제를 확인해 주세요.`;
  await dispatchStudentNotificationPush({
    eventKey: `assignment-distributed:${slot.id}`,
    sourceId: slot.id,
    studentId: slot.studentId,
    kind: "assignment",
    title,
    body,
    href: `/board/${encodeURIComponent(slot.board.slug)}`,
    actorLabel: "Aura Board",
    cardTitle: title,
    boardTitle: "과제",
    content: body,
    createdAt: slot.createdAt,
  }, { propagateFailure: true });
}

function cardStudentIds(card: {
  studentAuthorId: string | null;
  authors: Array<{ studentId: string | null }>;
}): string[] {
  return [...new Set([
    card.studentAuthorId,
    ...card.authors.map((author) => author.studentId),
  ].filter((id): id is string => Boolean(id)))];
}

function actorLabelFor(
  kind: string,
  name: string | null | undefined,
  anonymous: boolean,
): string {
  if (anonymous) return "익명";
  const trimmed = name?.trim();
  if (kind === "teacher") return trimmed ? `${trimmed} 선생님` : "선생님";
  if (kind === "student") return trimmed || "학생";
  return trimmed || "방문자";
}

function isIncomingTransaction(type: string): boolean {
  return INCOMING_TRANSACTION_TYPES.has(type);
}

function roEuroParticle(value: string): "로" | "으로" {
  const last = value.trim().at(-1);
  if (!last) return "으로";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "으로";
  const jongseong = (code - 0xac00) % 28;
  return jongseong === 0 || jongseong === 8 ? "로" : "으로";
}

function truncate(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit
    ? `${normalized.slice(0, limit - 1)}…`
    : normalized;
}

function safeOutboxError(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  return code ? `${name}:${code}`.slice(0, 200) : name.slice(0, 200);
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  work: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        await work(values[index]);
      }
    },
  ));
}
