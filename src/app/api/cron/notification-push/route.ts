import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  STUDENT_NOTIFICATION_REWARD_SOURCE_TYPES,
  studentRewardTitle,
  type StudentNotificationRewardSourceType,
} from "@/lib/student-notification-contract";
import {
  assignmentDistributedPush,
  attendanceReminderPush,
  dispatchStudentNotificationPush,
  shouldSendAttendanceReminder,
  studentPushKstDay,
} from "@/lib/student-push";
import { dispatchParentNotificationPush } from "@/lib/parent-push";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOOKBACK_MS = 10 * 60 * 1000;
const EVENT_LIMIT = 200;

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "invalid_secret" }, { status: 401 });
  }

  const since = new Date(Date.now() - LOOKBACK_MS);
  const attendanceDay = studentPushKstDay();
  const attendanceDate = new Date(`${attendanceDay}T00:00:00.000Z`);
  const attendanceReminderDue = shouldSendAttendanceReminder();
  const [
    likes,
    comments,
    rewards,
    pendingLinks,
    absentStudents,
    assignmentSlots,
  ] = await Promise.all([
    db.cardLike.findMany({
      where: {
        createdAt: { gte: since },
        OR: [
          { likerKind: "teacher" },
          { likerKind: "external" },
          { likerKind: "student" },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: EVENT_LIMIT,
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
    }),
    db.cardComment.findMany({
      where: {
        createdAt: { gte: since },
        deletedAt: null,
        OR: [
          { authorKind: "teacher" },
          { authorKind: "external" },
          { authorKind: "student" },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: EVENT_LIMIT,
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
    }),
    db.transaction.findMany({
      where: {
        createdAt: { gte: since },
        type: "deposit",
        sourceType: { in: [...STUDENT_NOTIFICATION_REWARD_SOURCE_TYPES] },
      },
      orderBy: { createdAt: "asc" },
      take: EVENT_LIMIT,
      include: { account: { select: { studentId: true } } },
    }),
    db.parentChildLink.findMany({
      where: {
        requestedAt: { gte: since },
        status: "pending",
        deletedAt: null,
      },
      orderBy: { requestedAt: "asc" },
      take: EVENT_LIMIT,
      select: {
        id: true,
        parentId: true,
        student: {
          select: { name: true, classroom: { select: { name: true } } },
        },
      },
    }),
    attendanceReminderDue
      ? db.student.findMany({
          where: {
            pushDevices: { some: { disabledAt: null } },
            attendances: { none: { day: attendanceDate } },
            pushDispatches: {
              none: {
                eventKey: {
                  startsWith: "attendance-missing:",
                  endsWith: `:${attendanceDay}`,
                },
              },
            },
          },
          orderBy: { id: "asc" },
          select: { id: true },
          take: EVENT_LIMIT,
        })
      : Promise.resolve([]),
    db.assignmentSlot.findMany({
      where: {
        createdAt: { gte: since },
        submissionStatus: "assigned",
      },
      orderBy: { createdAt: "asc" },
      take: EVENT_LIMIT,
      select: {
        id: true,
        studentId: true,
        board: { select: { slug: true, title: true } },
      },
    }),
  ]);

  const jobs: Array<Promise<unknown>> = [];
  for (const like of likes) {
    const actor = actorLabel(
      like.likerKind,
      like.likerKind === "teacher"
        ? like.likerUser?.name
        : like.likerStudent?.name,
      like.card.board.anonymousAuthor,
    );
    for (const studentId of cardStudentIds(like.card)) {
      if (studentId === like.likerStudentId) continue;
      jobs.push(dispatchStudentNotificationPush({
        eventKey: `like:${like.id}`,
        studentId,
        kind: "like",
        title: "게시물에 좋아요가 달렸어요",
        body: `${actor}이(가) ${like.card.title || "내 게시물"}에 좋아요를 눌렀어요.`,
        href: `/board/${like.card.board.slug}`,
      }));
    }
  }

  for (const comment of comments) {
    const actor = actorLabel(
      comment.authorKind,
      comment.authorKind === "teacher"
        ? comment.authorUser?.name
        : comment.authorKind === "student"
          ? comment.authorStudent?.name
          : comment.externalAuthorName,
      comment.card.board.anonymousAuthor,
    );
    for (const studentId of cardStudentIds(comment.card)) {
      if (studentId === comment.authorStudentId) continue;
      jobs.push(dispatchStudentNotificationPush({
        eventKey: `comment:${comment.id}`,
        studentId,
        kind: "comment",
        title: "게시물에 새 댓글이 달렸어요",
        body: `${actor}: ${truncate(comment.content, 80)}`,
        href: `/board/${comment.card.board.slug}`,
      }));
    }
  }

  for (const reward of rewards) {
    if (!reward.sourceType || !isRewardSourceType(reward.sourceType)) continue;
    jobs.push(dispatchStudentNotificationPush({
      eventKey: `reward:${reward.id}`,
      studentId: reward.account.studentId,
      kind: "reward",
      title: studentRewardTitle(reward.sourceType),
      body: reward.note
        ? `${truncate(reward.note, 80)} · +${reward.amount.toLocaleString("ko-KR")}`
        : `+${reward.amount.toLocaleString("ko-KR")} 보상을 받았어요.`,
      href: "/my/wallet",
    }));
  }

  for (const link of pendingLinks) {
    jobs.push(dispatchParentNotificationPush({
      eventKey: `parent-link-pending:${link.id}`,
      parentId: link.parentId,
      title: "자녀 연결 승인 대기",
      body: `${link.student.classroom.name}의 ${link.student.name} 학생 연결 승인을 기다리고 있어요.`,
      data: { type: "parent_notification", href: "/(parent)/notifications" },
    }));
  }

  for (const student of absentStudents) {
    jobs.push(
      dispatchStudentNotificationPush(
        attendanceReminderPush(student.id, attendanceDay),
      ),
    );
  }

  for (const slot of assignmentSlots) {
    jobs.push(
      dispatchStudentNotificationPush(
        assignmentDistributedPush({
          slotId: slot.id,
          studentId: slot.studentId,
          boardSlug: slot.board.slug,
          boardTitle: slot.board.title,
        }),
      ),
    );
  }

  const results = await Promise.allSettled(jobs);
  return NextResponse.json({
    scanned: {
      likes: likes.length,
      comments: comments.length,
      rewards: rewards.length,
      pendingLinks: pendingLinks.length,
      absentStudents: absentStudents.length,
      assignmentSlots: assignmentSlots.length,
    },
    dispatched: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  });
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

function actorLabel(kind: string, name: string | null | undefined, anonymous: boolean) {
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
