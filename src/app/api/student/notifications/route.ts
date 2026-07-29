import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { getSlimeShopItem } from "@/lib/pets/catalog";
import {
  STUDENT_NOTIFICATION_KINDS,
  STUDENT_NOTIFICATION_REFUND_SOURCE_TYPE,
  STUDENT_NOTIFICATION_REWARD_SOURCE_TYPES,
  studentRefundItemKey,
  studentRewardTitle,
  type StudentNotificationKind,
  type StudentNotificationRewardSourceType,
} from "@/lib/student-notification-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT_LIMIT = 20;
export async function GET() {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { likeWhere, commentWhere, rewardWhere, refundWhere } = notificationWhere(student);
  const pushWhere: Prisma.StudentPushDispatchWhereInput = {
    studentId: student.id,
    kind: { in: ["attendance", "assignment"] },
  };
  const [state, receipts, currency] = await Promise.all([
    db.studentNotificationState.findUnique({ where: { studentId: student.id } }),
    db.studentNotificationReceipt.findMany({
      where: { studentId: student.id },
      select: { notificationType: true, notificationId: true },
    }),
    db.classroomCurrency?.findUnique({
      where: { classroomId: student.classroomId },
      select: { unitLabel: true },
    }) ?? null,
  ]);
  const rewardUnit = currency?.unitLabel ?? "원";
  const lastReadAt = state?.lastReadAt ?? null;
  const readKeys = new Set(
    receipts.map((receipt) => `${receipt.notificationType}:${receipt.notificationId}`),
  );
  const unreadLikeIds = receipts
    .filter((receipt) => receipt.notificationType === "like")
    .map((receipt) => receipt.notificationId);
  const unreadCommentIds = receipts
    .filter((receipt) => receipt.notificationType === "comment")
    .map((receipt) => receipt.notificationId);
  const unreadRewardIds = receipts
    .filter((receipt) => receipt.notificationType === "reward")
    .map((receipt) => receipt.notificationId);
  const unreadRefundIds = receipts
    .filter((receipt) => receipt.notificationType === "refund")
    .map((receipt) => receipt.notificationId);
  const readPushIds = receipts
    .filter(
      (receipt) =>
        receipt.notificationType === "attendance" ||
        receipt.notificationType === "assignment",
    )
    .map((receipt) => receipt.notificationId);
  const unreadSince = lastReadAt ? { createdAt: { gt: lastReadAt } } : {};

  const [
    likeCount,
    commentCount,
    rewardCount,
    refundCount,
    pushCount,
    likes,
    comments,
    rewards,
    refunds,
    pushes,
  ] = await Promise.all([
    db.cardLike.count({
      where: {
        ...likeWhere,
        ...unreadSince,
        ...(unreadLikeIds.length > 0 ? { id: { notIn: unreadLikeIds } } : {}),
      },
    }),
    db.cardComment.count({
      where: {
        ...commentWhere,
        ...unreadSince,
        ...(unreadCommentIds.length > 0 ? { id: { notIn: unreadCommentIds } } : {}),
      },
    }),
    db.transaction.count({
      where: {
        ...rewardWhere,
        ...unreadSince,
        ...(unreadRewardIds.length > 0 ? { id: { notIn: unreadRewardIds } } : {}),
      },
    }),
    db.transaction.count({
      where: {
        ...refundWhere,
        ...unreadSince,
        ...(unreadRefundIds.length > 0 ? { id: { notIn: unreadRefundIds } } : {}),
      },
    }),
    db.studentPushDispatch.count({
      where: {
        ...pushWhere,
        ...unreadSince,
        ...(readPushIds.length > 0 ? { id: { notIn: readPushIds } } : {}),
      },
    }),
    db.cardLike.findMany({
      where: likeWhere,
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      include: {
        likerUser: { select: { name: true } },
        likerStudent: { select: { name: true } },
        card: {
          select: {
            title: true,
            board: { select: { slug: true, title: true, anonymousAuthor: true } },
          },
        },
      },
    }),
    db.cardComment.findMany({
      where: commentWhere,
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      include: {
        authorUser: { select: { name: true } },
        authorStudent: { select: { name: true } },
        card: {
          select: {
            title: true,
            board: { select: { slug: true, title: true, anonymousAuthor: true } },
          },
        },
      },
    }),
    db.transaction.findMany({
      where: rewardWhere,
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        amount: true,
        note: true,
        sourceType: true,
        createdAt: true,
      },
    }),
    db.transaction.findMany({
      where: refundWhere,
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        amount: true,
        note: true,
        sourceType: true,
        createdAt: true,
      },
    }),
    db.studentPushDispatch.findMany({
      where: pushWhere,
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        href: true,
        createdAt: true,
      },
    }),
  ]);

  const isRead = (kind: StudentNotificationKind, id: string, createdAt: Date) =>
    Boolean(lastReadAt && createdAt <= lastReadAt) || readKeys.has(`${kind}:${id}`);

  const likeItems = likes.map((like) => ({
    id: `like:${like.id}`,
    kind: "like" as const,
    actorLabel: formatActorLabel({
      kind: like.likerKind,
      name:
        like.likerKind === "teacher"
          ? like.likerUser?.name
          : like.likerKind === "student"
            ? like.likerStudent?.name
            : null,
      anonymous: like.card.board.anonymousAuthor,
    }),
    cardTitle: like.card.title,
    boardTitle: like.card.board.title,
    href: `/board/${like.card.board.slug}`,
    createdAt: like.createdAt.toISOString(),
    read: isRead("like", like.id, like.createdAt),
  }));

  const commentItems = comments.map((comment) => ({
    id: `comment:${comment.id}`,
    kind: "comment" as const,
    actorLabel: formatActorLabel({
      kind: comment.authorKind,
      name:
        comment.authorKind === "teacher"
          ? comment.authorUser?.name
          : comment.authorKind === "student"
            ? comment.authorStudent?.name
            : comment.externalAuthorName,
      anonymous: comment.card.board.anonymousAuthor,
    }),
    cardTitle: comment.card.title,
    boardTitle: comment.card.board.title,
    href: `/board/${comment.card.board.slug}`,
    createdAt: comment.createdAt.toISOString(),
    content: truncate(comment.content, 72),
    read: isRead("comment", comment.id, comment.createdAt),
  }));

  const rewardItems = rewards.map((transaction) => {
    const sourceType = isRewardSourceType(transaction.sourceType)
      ? transaction.sourceType
      : null;
    const title = sourceType ? studentRewardTitle(sourceType) : "보상";
    const amount = `+${transaction.amount.toLocaleString("ko-KR")} ${rewardUnit}`;
    const note = transaction.note ? truncate(transaction.note, 120) : null;
    return {
      id: `reward:${transaction.id}`,
      kind: "reward" as const,
      actorLabel: "보상",
      cardTitle: title,
      boardTitle: "내 통장",
      href: "/my/wallet",
      createdAt: transaction.createdAt.toISOString(),
      content: [note, amount].filter(Boolean).join(" · "),
      read: isRead("reward", transaction.id, transaction.createdAt),
    };
  });

  const refundItems = refunds.map((transaction) => {
    const itemKey = studentRefundItemKey(transaction.note);
    /**
     * A retired item is gone from the catalog, so its label may be unresolvable.
     * Fall back to wording that still explains the money instead of showing a raw
     * key to a child.
     */
    const itemLabel = itemKey ? getSlimeShopItem(itemKey)?.labelKo ?? null : null;
    const amount = `+${transaction.amount.toLocaleString("ko-KR")} ${rewardUnit}`;
    return {
      id: `refund:${transaction.id}`,
      kind: "refund" as const,
      actorLabel: "펫 상점",
      cardTitle: itemLabel
        ? `${itemLabel}을(를) 돌려드렸어요`
        : "상점에서 사라진 물건 값을 돌려드렸어요",
      boardTitle: "내 통장",
      href: "/my/wallet",
      createdAt: transaction.createdAt.toISOString(),
      content: [
        "상점에서 더 이상 팔지 않게 되어 샀던 금액을 그대로 돌려줬어요.",
        amount,
      ].join(" · "),
      read: isRead("refund", transaction.id, transaction.createdAt),
    };
  });

  const pushItems = pushes.flatMap((push) => {
    if (!isPersistentPushKind(push.kind)) return [];
    const fallbackTitle = push.kind === "attendance"
      ? "오늘 출석을 확인해 주세요"
      : "새 과제가 도착했어요";
    return [{
      id: `${push.kind}:${push.id}`,
      kind: push.kind,
      actorLabel: "Aura Board",
      cardTitle: push.title || fallbackTitle,
      boardTitle: push.kind === "attendance" ? "출석" : "과제",
      href: push.href || "/student",
      createdAt: push.createdAt.toISOString(),
      content: push.body || undefined,
      read: isRead(push.kind, push.id, push.createdAt),
    }];
  });

  const items = [...likeItems, ...commentItems, ...rewardItems, ...refundItems, ...pushItems]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, RECENT_LIMIT);

  return NextResponse.json({
    count: likeCount + commentCount + rewardCount + refundCount + pushCount,
    items,
  });
}

export async function POST(req: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const input = body as { action?: unknown; kind?: unknown; id?: unknown };

  if (input.action === "mark_all_read") {
    const now = new Date();
    await db.studentNotificationState.upsert({
      where: { studentId: student.id },
      create: { studentId: student.id, lastReadAt: now },
      update: { lastReadAt: now },
    });
    return NextResponse.json({ ok: true, action: "mark_all_read" });
  }

  if (
    input.action !== "mark_read" ||
    !(STUDENT_NOTIFICATION_KINDS as readonly unknown[]).includes(input.kind) ||
    typeof input.id !== "string" ||
    input.id.length === 0 ||
    input.id.length > 128
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const kind = input.kind as StudentNotificationKind;
  const { likeWhere, commentWhere, rewardWhere, refundWhere } = notificationWhere(student);
  const notification =
    kind === "like"
      ? await db.cardLike.findFirst({ where: { ...likeWhere, id: input.id }, select: { id: true } })
      : kind === "comment"
        ? await db.cardComment.findFirst({
            where: { ...commentWhere, id: input.id },
            select: { id: true },
          })
        : kind === "reward"
          ? await db.transaction.findFirst({
              where: { ...rewardWhere, id: input.id },
              select: { id: true },
            })
          : kind === "refund"
            ? await db.transaction.findFirst({
                where: { ...refundWhere, id: input.id },
                select: { id: true },
              })
            : await db.studentPushDispatch.findFirst({
                where: {
                  id: input.id,
                  studentId: student.id,
                  kind,
                },
                select: { id: true },
              });
  if (!notification) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await db.studentNotificationReceipt.upsert({
    where: {
      studentId_notificationType_notificationId: {
        studentId: student.id,
        notificationType: kind,
        notificationId: input.id,
      },
    },
    create: {
      studentId: student.id,
      notificationType: kind,
      notificationId: input.id,
    },
    update: {},
  });

  return NextResponse.json({ ok: true, action: "mark_read" });
}

function notificationWhere(student: { id: string; classroomId: string }): {
  likeWhere: Prisma.CardLikeWhereInput;
  commentWhere: Prisma.CardCommentWhereInput;
  rewardWhere: Prisma.TransactionWhereInput;
  refundWhere: Prisma.TransactionWhereInput;
} {
  const ownedCardWhere: Prisma.CardWhereInput = {
    board: { classroomId: student.classroomId },
    OR: [
      { studentAuthorId: student.id },
      { authors: { some: { studentId: student.id } } },
    ],
  };
  return {
    likeWhere: {
      card: ownedCardWhere,
      OR: [
        { likerKind: "teacher" },
        { likerKind: "external" },
        { likerKind: "student", likerStudentId: { not: student.id } },
      ],
    },
    commentWhere: {
      card: ownedCardWhere,
      deletedAt: null,
      OR: [
        { authorKind: "teacher" },
        { authorKind: "external" },
        { authorKind: "student", authorStudentId: { not: student.id } },
      ],
    },
    rewardWhere: {
      account: { studentId: student.id, classroomId: student.classroomId },
      type: "deposit",
      sourceType: { in: [...STUDENT_NOTIFICATION_REWARD_SOURCE_TYPES] },
    },
    /**
     * Shop refunds credit the wallet without any student action, including the
     * bulk refund issued when an item is retired from the catalog. Surfacing them
     * here is what stops the balance from changing unexplained.
     */
    refundWhere: {
      account: { studentId: student.id, classroomId: student.classroomId },
      type: "refund",
      sourceType: STUDENT_NOTIFICATION_REFUND_SOURCE_TYPE,
    },
  };
}

function isRewardSourceType(
  value: string | null,
): value is StudentNotificationRewardSourceType {
  return value !== null &&
    (STUDENT_NOTIFICATION_REWARD_SOURCE_TYPES as readonly string[]).includes(value);
}

function isPersistentPushKind(
  value: string | null,
): value is "attendance" | "assignment" {
  return value === "attendance" || value === "assignment";
}

function formatActorLabel({
  kind,
  name,
  anonymous,
}: {
  kind: "teacher" | "student" | "external";
  name: string | null | undefined;
  anonymous: boolean;
}) {
  const trimmed = name?.trim();
  if (kind === "external") return trimmed || "방문자";
  if (anonymous) return "익명";
  if (kind === "teacher") return trimmed ? `${trimmed} 선생님` : "선생님";
  return trimmed || "학생";
}

function truncate(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1)}…`;
}
