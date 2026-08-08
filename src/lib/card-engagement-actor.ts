import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import { getCurrentUser } from "./auth";
import { getCurrentStudentIdentityRaw } from "./student-auth";
import { getCurrentParent } from "./parent-session";
import { loadCardAccessBaseCached } from "./card-access-cache";

// card-comments-likes (2026-04-26): 카드 engagement (댓글/좋아요) 의 actor
// 식별 + 카드 가시성 검사 단일 진입점.
//
// 3가지 actor:
//   - teacher: NextAuth 세션. 교사 본인이 학급 소유자이거나 보드 멤버면 카드 접근 가능.
//   - student: HMAC 쿠키. 학급 소속 카드만 접근.
//   - parent: ParentSession. active 링크된 정확한 자녀가 작성한 카드만 접근.

export type CardActor =
  | { kind: "teacher"; id: string; name: string }
  | {
      kind: "student";
      id: string;
      name: string;
      classroomId: string;
      accountId?: string | null;
      accountCardId?: string | null;
    }
  | { kind: "parent"; id: string; name: string };

function studentActorFromIdentity(
  student: NonNullable<Awaited<ReturnType<typeof getCurrentStudentIdentityRaw>>>,
): Extract<CardActor, { kind: "student" }> {
  return {
    kind: "student",
    id: student.id,
    name: student.name,
    classroomId: student.classroomId,
    accountId: student.accountId ?? null,
    accountCardId: student.accountCardId ?? null,
  };
}

export async function getCurrentCardActor(): Promise<CardActor | null> {
  const headerList = await headers();
  const preferStudent =
    headerList.get("x-aura-student-viewer") === "1";
  if (preferStudent) {
    const student = await getCurrentStudentIdentityRaw().catch(() => null);
    if (student) return studentActorFromIdentity(student);
  }

  try {
    const user = await getCurrentUser();
    if (user) return { kind: "teacher", id: user.id, name: user.name ?? "선생님" };
  } catch {
    /* not teacher */
  }
  const student = await getCurrentStudentIdentityRaw().catch(() => null);
  if (student) return studentActorFromIdentity(student);
  const parent = await getCurrentParent().catch(() => null);
  if (parent) {
    return { kind: "parent", id: parent.parent.id, name: parent.parent.name };
  }
  return null;
}

export interface CardAccessContext {
  cardId: string;
  boardId: string;
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
  if (actor.kind === "teacher") {
    const card = await db.card.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        studentAuthorId: true,
        authors: { select: { studentId: true } },
        board: {
          select: {
            id: true,
            classroomId: true,
            anonymousAuthor: true,
            classroom: { select: { teacherId: true } },
            members: {
              where: { userId: actor.id },
              select: { userId: true },
            },
          },
        },
      },
    });
    if (!card) return { ok: false, reason: "not_found" };
    const studentAuthorIds = Array.from(
      new Set(
        [card.studentAuthorId, ...card.authors.map((author) => author.studentId)].filter(
          (studentId): studentId is string => Boolean(studentId),
        ),
      ),
    );
    const isClassroomTeacher = card.board.classroom?.teacherId === actor.id;
    const isBoardMember = card.board.members.some((member) => member.userId === actor.id);
    if (!isClassroomTeacher && !isBoardMember) {
      return { ok: false, reason: "forbidden" };
    }
    return {
      ok: true,
      ctx: {
        cardId: card.id,
        boardId: card.board.id,
        classroomId: card.board.classroomId,
        anonymousAuthor: card.board.anonymousAuthor,
        studentAuthorId: card.studentAuthorId,
        studentAuthorIds,
        guardianAvailable: studentAuthorIds.length > 0,
      },
    };
  }

  const card = await loadCardAccessBaseCached(cardId, async () => {
    const row = await db.card.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        studentAuthorId: true,
        authors: { select: { studentId: true } },
        board: {
          select: {
            id: true,
            classroomId: true,
            anonymousAuthor: true,
          },
        },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      studentAuthorId: row.studentAuthorId,
      studentAuthorIds: Array.from(
        new Set(
          [row.studentAuthorId, ...row.authors.map((author) => author.studentId)].filter(
            (studentId): studentId is string => Boolean(studentId),
          ),
        ),
      ),
      board: row.board,
    };
  });
  if (!card) return { ok: false, reason: "not_found" };

  const classroomId = card.board.classroomId;
  if (!classroomId) return { ok: false, reason: "no_classroom" };
  if (actor.kind === "student") {
    if (actor.classroomId !== classroomId) {
      return { ok: false, reason: "forbidden" };
    }
  } else {
    if (card.studentAuthorIds.length === 0) {
      return { ok: false, reason: "forbidden" };
    }
    const link = await db.parentChildLink.findFirst({
      where: {
        parentId: actor.id,
        studentId: { in: card.studentAuthorIds },
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
      boardId: card.board.id,
      classroomId,
      anonymousAuthor: card.board.anonymousAuthor,
      studentAuthorId: card.studentAuthorId,
      studentAuthorIds: card.studentAuthorIds,
      guardianAvailable:
        card.studentAuthorIds.length > 0 &&
        (actor.kind === "parent" || card.studentAuthorIds.includes(actor.id)),
    },
  };
}
