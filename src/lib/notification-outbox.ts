import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { dispatchParentNotificationPush } from "@/lib/parent-push";
import {
  STUDENT_NOTIFICATION_REFUND_SOURCE_TYPE,
  STUDENT_NOTIFICATION_REWARD_SOURCE_TYPES,
  studentRefundItemKey,
  studentRewardTitle,
  type StudentNotificationRewardSourceType,
} from "@/lib/student-notification-contract";
import { dispatchStudentNotificationPush } from "@/lib/student-push";
import { getSlimeShopItem } from "@/lib/pets/catalog";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 5;
const MAX_ATTEMPTS = 8;
const LEASE_MS = 5 * 60 * 1_000;

export type ClaimedNotificationOutbox = {
  id: string;
  eventType: string;
  sourceId: string;
  attempts: number;
  lockToken: string;
};

export type NotificationOutboxRun = {
  claimed: number;
  processed: number;
  retried: number;
  dead: number;
};

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
                outbox."attempts", outbox."lockToken"
    `,
  ));
}

export async function consumeNotificationOutbox(options: {
  batchSize?: number;
  concurrency?: number;
  now?: Date;
} = {}): Promise<NotificationOutboxRun> {
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
      likerUser: { select: { name: true } },
      likerStudent: { select: { name: true } },
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
  if (!like || !["teacher", "student", "external"].includes(like.likerKind)) return;

  const actorLabel = actorLabelFor(
    like.likerKind,
    like.likerKind === "teacher" ? like.likerUser?.name : like.likerStudent?.name,
    like.card.board.anonymousAuthor,
  );
  const title = "게시물에 좋아요가 눌렸어요";
  const body = `${actorLabel}이(가) ${like.card.title || "내 게시물"}에 좋아요를 눌렀어요.`;
  await Promise.all(cardStudentIds(like.card)
    .filter((studentId) => studentId !== like.likerStudentId)
    .map((studentId) => dispatchStudentNotificationPush({
      eventKey: `like:${like.id}`,
      sourceId: like.id,
      studentId,
      kind: "like",
      title,
      body,
      href: `/board/${like.card.board.slug}`,
      actorLabel,
      cardTitle: like.card.title || "내 게시물",
      boardTitle: like.card.board.title,
      content: null,
      createdAt: like.createdAt,
    }, { propagateFailure: true })));
}

async function processCardComment(sourceId: string): Promise<void> {
  const comment = await db.cardComment.findUnique({
    where: { id: sourceId },
    include: {
      authorUser: { select: { name: true } },
      authorStudent: { select: { name: true } },
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
  if (!comment || comment.deletedAt) return;

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
  await Promise.all(cardStudentIds(comment.card)
    .filter((studentId) => studentId !== comment.authorStudentId)
    .map((studentId) => dispatchStudentNotificationPush({
      eventKey: `comment:${comment.id}`,
      sourceId: comment.id,
      studentId,
      kind: "comment",
      title: "게시물에 새 댓글이 달렸어요",
      body: `${actorLabel}: ${truncate(comment.content, 80)}`,
      href: `/board/${comment.card.board.slug}`,
      actorLabel,
      cardTitle: comment.card.title || "내 게시물",
      boardTitle: comment.card.board.title,
      content,
      createdAt: comment.createdAt,
    }, { propagateFailure: true })));
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
  if (!transaction?.sourceType) return;

  const unit = transaction.account.classroom.currency?.unitLabel ?? "원";
  const amount = `+${transaction.amount.toLocaleString("ko-KR")} ${unit}`;
  if (
    transaction.type === "deposit" &&
    isRewardSourceType(transaction.sourceType)
  ) {
    const cardTitle = studentRewardTitle(transaction.sourceType);
    const content = [transaction.note && truncate(transaction.note, 120), amount]
      .filter(Boolean)
      .join(" · ");
    await dispatchStudentNotificationPush({
      eventKey: `reward:${transaction.id}`,
      sourceId: transaction.id,
      studentId: transaction.account.studentId,
      kind: "reward",
      title: cardTitle,
      body: content,
      href: "/my/wallet",
      actorLabel: "보상",
      cardTitle,
      boardTitle: "내 통장",
      content,
      createdAt: transaction.createdAt,
    }, { propagateFailure: true });
    return;
  }

  if (
    transaction.type === "refund" &&
    transaction.sourceType === STUDENT_NOTIFICATION_REFUND_SOURCE_TYPE
  ) {
    const itemKey = studentRefundItemKey(transaction.note);
    const itemLabel = itemKey ? getSlimeShopItem(itemKey)?.labelKo : null;
    const cardTitle = itemLabel
      ? `${itemLabel} 값을 돌려드렸어요`
      : "상점에서 사라진 물건 값을 돌려드렸어요";
    const content = `상점에서 더 이상 살 수 없게 되어 값을 그대로 돌려주었어요 · ${amount}`;
    await dispatchStudentNotificationPush({
      eventKey: `refund:${transaction.id}`,
      sourceId: transaction.id,
      studentId: transaction.account.studentId,
      kind: "refund",
      title: cardTitle,
      body: content,
      href: "/my/wallet",
      actorLabel: "상점",
      cardTitle,
      boardTitle: "내 통장",
      content,
      createdAt: transaction.createdAt,
    }, { propagateFailure: true });
  }
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

function truncate(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit
    ? `${normalized.slice(0, limit - 1)}…`
    : normalized;
}

function isRewardSourceType(
  value: string,
): value is StudentNotificationRewardSourceType {
  return (STUDENT_NOTIFICATION_REWARD_SOURCE_TYPES as readonly string[]).includes(value);
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
