import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT_LIMIT = 20;
type NotificationKind = "like" | "comment";

export async function GET() {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { likeWhere, commentWhere } = notificationWhere(student);
  const [state, receipts] = await Promise.all([
    db.studentNotificationState.findUnique({ where: { studentId: student.id } }),
    db.studentNotificationReceipt.findMany({
      where: { studentId: student.id },
      select: { notificationType: true, notificationId: true },
    }),
  ]);
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
  const unreadSince = lastReadAt ? { createdAt: { gt: lastReadAt } } : {};

  const [likeCount, commentCount, likes, comments] = await Promise.all([
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

  const items = [...likeItems, ...commentItems]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, RECENT_LIMIT);

  return NextResponse.json({ count: likeCount + commentCount, items });
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
    (input.kind !== "like" && input.kind !== "comment") ||
    typeof input.id !== "string" ||
    input.id.length === 0 ||
    input.id.length > 128
  ) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const kind = input.kind as NotificationKind;
  const { likeWhere, commentWhere } = notificationWhere(student);
  const notification =
    kind === "like"
      ? await db.cardLike.findFirst({ where: { ...likeWhere, id: input.id }, select: { id: true } })
      : await db.cardComment.findFirst({
          where: { ...commentWhere, id: input.id },
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
  };
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
