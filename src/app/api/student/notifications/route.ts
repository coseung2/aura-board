import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT_LIMIT = 20;
const REWARD_SOURCE_TYPES = [
  "reading_reward",
  "comment_reward",
  "walking_reward",
  "walking_weekly_reward",
  "assignment_reward",
] as const;
type RewardSourceType = (typeof REWARD_SOURCE_TYPES)[number];
type NotificationKind = "like" | "comment" | "reward";

export async function GET() {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { likeWhere, commentWhere, rewardWhere } = notificationWhere(student);
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
  const unreadSince = lastReadAt ? { createdAt: { gt: lastReadAt } } : {};

  const [likeCount, commentCount, rewardCount, likes, comments, rewards] = await Promise.all([
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
  ]);

  const isRead = (kind: NotificationKind, id: string, createdAt: Date) =>
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
    const title = sourceType ? rewardTitle(sourceType) : "보상";
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

  const items = [...likeItems, ...commentItems, ...rewardItems]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, RECENT_LIMIT);

  return NextResponse.json({ count: likeCount + commentCount + rewardCount, items });
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
    (input.kind !== "like" && input.kind !== "comment" && input.kind !== "reward") ||
    typeof input.id !== "string" ||
    input.id.length === 0 ||
    input.id.length > 128
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const kind = input.kind as NotificationKind;
  const { likeWhere, commentWhere, rewardWhere } = notificationWhere(student);
  const notification =
    kind === "like"
      ? await db.cardLike.findFirst({ where: { ...likeWhere, id: input.id }, select: { id: true } })
      : kind === "comment"
        ? await db.cardComment.findFirst({
            where: { ...commentWhere, id: input.id },
            select: { id: true },
          })
        : await db.transaction.findFirst({
            where: { ...rewardWhere, id: input.id },
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
      sourceType: { in: [...REWARD_SOURCE_TYPES] },
    },
  };
}

function isRewardSourceType(value: string | null): value is RewardSourceType {
  return value !== null && (REWARD_SOURCE_TYPES as readonly string[]).includes(value);
}

function rewardTitle(sourceType: RewardSourceType): string {
  switch (sourceType) {
    case "reading_reward":
      return "독서 보상";
    case "comment_reward":
      return "댓글 보상";
    case "walking_reward":
      return "걷기 보상";
    case "walking_weekly_reward":
      return "주간 걷기 보상";
    case "assignment_reward":
      return "과제 제출 보상";
  }
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
