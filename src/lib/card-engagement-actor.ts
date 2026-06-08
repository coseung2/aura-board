import "server-only";
import { db } from "./db";
import { getCurrentUser } from "./auth";
import { getCurrentStudent } from "./student-auth";
import { getCurrentParent } from "./parent-session";

// card-comments-likes (2026-04-26): 카드 engagement (댓글/좋아요) 의 actor
// 식별 + 카드 가시성 검사 단일 진입점.
//
// 3가지 actor:
//   - teacher: NextAuth 세션. 교사 본인이 학급 소유자이거나 보드 멤버면 카드 접근 가능.
//   - student: HMAC 쿠키. 학급 소속 카드만 접근.
//   - parent: ParentSession. 자녀(ParentChildLink active)의 학급 카드만 read.
//             write (댓글/좋아요) 는 차단.

export type CardActor =
  | { kind: "teacher"; id: string; name: string }
  | { kind: "student"; id: string; name: string; classroomId: string }
  | { kind: "parent"; id: string };

export async function getCurrentCardActor(): Promise<CardActor | null> {
  try {
    const u = await getCurrentUser();
    if (u) return { kind: "teacher", id: u.id, name: u.name ?? "선생님" };
  } catch {
    /* not teacher */
  }
  const s = await getCurrentStudent().catch(() => null);
  if (s) return { kind: "student", id: s.id, name: s.name, classroomId: s.classroomId };
  const p = await getCurrentParent().catch(() => null);
  if (p) return { kind: "parent", id: p.parent.id };
  return null;
}

export interface CardAccessContext {
  cardId: string;
  classroomId: string | null;
  anonymousAuthor: boolean;
}

/**
 * 카드 접근 권한을 검사. read 면 teacher/student/parent 모두, write 면
 * teacher/student 만 (parent 차단).
 *
 * 학급 단위 게이트 + 보드 멤버 게이트. 학생/학부모는 학급 매핑이 필요하지만,
 * 교사는 학급에 할당되지 않은 개인 보드도 BoardMember 이면 댓글/좋아요 가능.
 */
export async function authorizeCardAccess(
  cardId: string,
  actor: CardActor,
  mode: "read" | "write"
): Promise<{ ok: true; ctx: CardAccessContext } | { ok: false; reason: "not_found" | "forbidden" | "no_classroom" }> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      board: {
        select: {
          classroomId: true,
          anonymousAuthor: true,
          classroom: { select: { teacherId: true } },
          members: {
            where: { userId: actor.kind === "teacher" ? actor.id : "" },
            select: { userId: true },
          },
        },
      },
    },
  });
  if (!card) return { ok: false, reason: "not_found" };
  const classroomId = card.board.classroomId;

  if (mode === "write" && actor.kind === "parent") {
    return { ok: false, reason: "forbidden" };
  }

  if (actor.kind === "teacher") {
    const isClassroomTeacher = card.board.classroom?.teacherId === actor.id;
    const isBoardMember = card.board.members.some((m) => m.userId === actor.id);
    if (!isClassroomTeacher && !isBoardMember) {
      return { ok: false, reason: "forbidden" };
    }
  } else if (actor.kind === "student") {
    if (!classroomId) return { ok: false, reason: "no_classroom" };
    if (actor.classroomId !== classroomId) {
      return { ok: false, reason: "forbidden" };
    }
  } else {
    if (!classroomId) return { ok: false, reason: "no_classroom" };
    // parent — must have an active ParentChildLink to a student in this classroom
    const link = await db.parentChildLink.findFirst({
      where: {
        parentId: actor.id,
        status: "active",
        deletedAt: null,
        student: { classroomId },
      },
      select: { id: true },
    });
    if (!link) return { ok: false, reason: "forbidden" };
  }

  return {
    ok: true,
    ctx: {
      cardId: card.id,
      classroomId,
      anonymousAuthor: card.board.anonymousAuthor,
    },
  };
}
