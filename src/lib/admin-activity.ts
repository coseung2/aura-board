import "server-only";
import { db } from "@/lib/db";

type ActivityActor = {
  actorType: string;
  actorId: string | null;
};

type ActivityUser = { name: string; email: string };
type ActivityStudent = {
  name: string;
  classroom: { teacher: { name: string; email: string } };
};

export type AdminActivityActorDirectory = {
  users: Map<string, ActivityUser>;
  students: Map<string, ActivityStudent>;
};

export async function loadAdminActivityActors(
  activities: ActivityActor[],
): Promise<AdminActivityActorDirectory> {
  const actorIds = Array.from(
    new Set(
      activities
        .map((activity) => activity.actorId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [users, students] = await Promise.all([
    db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    }),
    db.student.findMany({
      where: { id: { in: actorIds } },
      select: {
        id: true,
        name: true,
        classroom: {
          select: { teacher: { select: { name: true, email: true } } },
        },
      },
    }),
  ]);

  return {
    users: new Map(users.map((user) => [user.id, user])),
    students: new Map(students.map((student) => [student.id, student])),
  };
}

export function formatAdminActivityActor(
  actorType: string,
  actorId: string | null,
  directory: AdminActivityActorDirectory,
): string {
  if (actorId && (actorType === "teacher" || actorType === "admin")) {
    const user = directory.users.get(actorId);
    if (user) return user.name.trim() || user.email;
  }

  if (actorId && actorType === "student") {
    const student = directory.students.get(actorId);
    if (student) {
      const teacherName = student.classroom.teacher.name.trim()
        || student.classroom.teacher.email;
      return `${student.name} 학생 · ${teacherName} 교사`;
    }
  }

  const labels: Record<string, string> = {
    teacher: "교사",
    student: "학생",
    guest: "공유 방문자",
    system: "시스템",
    admin: "관리자",
  };
  return labels[actorType] ?? actorType;
}

export function formatBoardActivityAction(action: string): string {
  const labels: Record<string, string> = {
    "board.updated": "보드 변경",
    "board.settings.updated": "보드 설정 변경",
    "section.created": "섹션 생성",
    "section.updated": "섹션 변경",
    "section.deleted": "섹션 삭제",
    "card.created": "카드 작성",
    "card.updated": "카드 수정",
    "card.deleted": "카드 삭제",
    "card.moved": "카드 이동",
    "comment.created": "댓글 작성",
    "like.created": "좋아요",
    "like.deleted": "좋아요 취소",
  };
  return labels[action] ?? action;
}

export function formatActivityRelativeTime(date: Date): string {
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
