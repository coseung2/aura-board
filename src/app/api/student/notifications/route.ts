import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECENT_LIMIT = 20;

export async function GET() {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ownedCardWhere = {
    board: { classroomId: student.classroomId },
    OR: [
      { studentAuthorId: student.id },
      { authors: { some: { studentId: student.id } } },
    ],
  };

  const [likeCount, commentCount, likes, comments] = await Promise.all([
    db.cardLike.count({
      where: {
        card: ownedCardWhere,
        OR: [
          { likerKind: "teacher" },
          { likerKind: "external" },
          { likerKind: "student", likerStudentId: { not: student.id } },
        ],
      },
    }),
    db.cardComment.count({
      where: {
        card: ownedCardWhere,
        deletedAt: null,
        OR: [
          { authorKind: "teacher" },
          { authorKind: "external" },
          { authorKind: "student", authorStudentId: { not: student.id } },
        ],
      },
    }),
    db.cardLike.findMany({
      where: {
        card: ownedCardWhere,
        OR: [
          { likerKind: "teacher" },
          { likerKind: "external" },
          { likerKind: "student", likerStudentId: { not: student.id } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      include: {
        likerUser: { select: { name: true } },
        likerStudent: { select: { name: true } },
        card: {
          select: {
            id: true,
            title: true,
            board: {
              select: { slug: true, title: true, anonymousAuthor: true },
            },
          },
        },
      },
    }),
    db.cardComment.findMany({
      where: {
        card: ownedCardWhere,
        deletedAt: null,
        OR: [
          { authorKind: "teacher" },
          { authorKind: "external" },
          { authorKind: "student", authorStudentId: { not: student.id } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      include: {
        authorUser: { select: { name: true } },
        authorStudent: { select: { name: true } },
        card: {
          select: {
            id: true,
            title: true,
            board: {
              select: { slug: true, title: true, anonymousAuthor: true },
            },
          },
        },
      },
    }),
  ]);

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
  }));

  const items = [...likeItems, ...commentItems]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, RECENT_LIMIT);

  return NextResponse.json({ count: likeCount + commentCount, items });
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
