import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import { getCurrentUser } from "./auth";
import { getCurrentStudent, getCurrentStudentRaw } from "./student-auth";
import { getCurrentParent } from "./parent-session";

// card-comments-likes (2026-04-26): 카드 engagement (댓글/좋아요) 의 actor
// 식별 + 카드 가시성 검사 단일 진입점.
//
// 3가지 actor:
//   - teacher: NextAuth 세션. 교사 본인이 학급 소유자이거나 보드 멤버면 카드 접근 가능.
//   - student: HMAC 쿠키. 학급 소속 카드만 접근.
//   - parent: ParentSession. active 링크된 정확한 자녀가 작성한 카드만 접근.

export type CardActor =
  | { kind: "teacher"; id: string; name: string }
  | { kind: "student"; id: string; name: string; classroomId: string }
  | { kind: "parent"; id: string; name: string };

export async function getCurrentCardActor(): Promise<CardActor | null> {
  const headerList = await headers();
  const preferStudent =
    headerList.get("x-aura-student-viewer") === "1";
  if (preferStudent) {
    const s = await getCurrentStudentRaw().catch(() => null);
    if (s) return { kind: "student", id: s.id, name: s.name, classroomId: s.classroomId };
  }

  try {
    const u = await getCurrentUser();
    if (u) return { kind: "teacher", id: u.id, name: u.name ?? "선생님" };
  } catch {
    /* not teacher */
  }
  const s = await getCurrentStudent().catch(() => null);
  if (s) return { kind: "student", id: s.id, name: s.name, classroomId: s.classroomId };
  const p = await getCurrentParent().catch(() => null);
  if (p) return { kind: "parent", id: p.parent.id, name: p.parent.name };
  return null;
}

export interface CardAccessContext {
  cardId: string;
  classroomId: string | null;
  anonymousAuthor: boolean;
  studentAuthorId: string | null;
  studentAuthorIds: string[];
  guardianAvailable: boolean;
}

/**
 * 카드 접근 권한을 검사. 학부모는 active 링크된 정확한 자녀가 작성한
 * 카드에서만 읽기/guardian 댓글/좋아요가 가능하다.
 *
 * 학급 단위 게이트 + 보드 멤버 게이트. 학생/학부모는 학급 매핑이 필요하지만,
 * 교사는 학급에 할당되지 않은 개인 보드도 BoardMember 이면 댓글/좋아요 가능.
 */
export async function authorizeCardAccess(
  cardId: string,
  actor: CardActor,
  _mode: "read" | "write"
): Promise<{ ok: true; ctx: CardAccessContext } | { ok: false; reason: "not_found" | "forbidden" | "no_classroom" }> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      studentAuthorId: true,
      authors: { select: { studentId: true } },
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
  const studentAuthorIds = Array.from(
    new Set(
      [card.studentAuthorId, ...card.authors.map((author) => author.studentId)].filter(
        (studentId): studentId is string => Boolean(studentId),
      ),
    ),
  );

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
    if (studentAuthorIds.length === 0) return { ok: false, reason: "forbidden" };
    // Parent feed includes both primary and CardAuthor co-authors. Engagement
    // must use the same scope or a visible child post can reject likes/comments.
    const link = await db.parentChildLink.findFirst({
      where: {
        parentId: actor.id,
        studentId: { in: studentAuthorIds },
        status: "active",
        deletedAt: null,
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
      studentAuthorId: card.studentAuthorId,
      studentAuthorIds,
      guardianAvailable:
        studentAuthorIds.length > 0 &&
        (actor.kind === "teacher" ||
          (actor.kind === "student" && studentAuthorIds.includes(actor.id)) ||
          actor.kind === "parent"),
    },
  };
}
