/**
 * Card-level permission primitives for role-model-cleanup.
 *
 * Identity × ownership → capabilities. Pure functions with no I/O so they
 * can be called from server components, API routes, and (if needed) from
 * client components that already have the identity object in hand.
 *
 * The legacy BoardMember.role enum (`owner|editor|viewer`) is being
 * retired — it couldn't express "student is editor of their own card but
 * viewer of others'" because role was single-valued. See
 * `tasks/2026-04-15-role-model-cleanup/phase1/research.md` for the
 * motivation.
 *
 * Multi-identity: predicates accept `Identities` (the per-request bundle
 * of every signed-in credential) and OR across all three paths. A teacher
 * who is ALSO a parent of a student in another classroom no longer has
 * their parent path masked by the teacher precedence.
 */

/** A signed-in teacher (NextAuth session resolved to a User row). */
export type TeacherIdentity = {
  userId: string;
  name: string;
  /** Boards where this teacher is the classroom/board owner. */
  ownsBoardIds: Set<string>;
};

/** A signed-in student (HMAC student_session cookie). */
export type StudentIdentity = {
  studentId: string;
  name: string;
  classroomId: string;
};

/** A signed-in parent (parent-session cookie). */
export type ParentIdentity = {
  parentId: string;
  /** Active (status='active' AND deletedAt:null) child student ids. */
  childStudentIds: Set<string>;
};

/**
 * Every identity a request carries. A single browser can legitimately
 * hold all three cookies — e.g. a teacher who is also a parent of a
 * student in another classroom. Predicates OR across the non-null
 * members so no identity is masked by precedence.
 *
 * `primary` is purely for UI display / write stamping, NOT for authz.
 */
export type Identities = {
  teacher: TeacherIdentity | null;
  student: StudentIdentity | null;
  parent: ParentIdentity | null;
  primary: "teacher" | "student" | "parent" | "anon";
};

/**
 * Legacy single-identity tagged union. Still used by existing tests and
 * callers that only care about the primary identity. Wrap with
 * `asIdentities(id)` to hand to a predicate.
 */
export type Identity =
  | ({ kind: "teacher" } & TeacherIdentity)
  | ({ kind: "student" } & StudentIdentity)
  | ({ kind: "parent" } & ParentIdentity)
  | { kind: "anon" };

/** Lift a legacy single Identity into the multi-identity bundle. */
export function asIdentities(id: Identity): Identities {
  switch (id.kind) {
    case "teacher":
      return {
        teacher: { userId: id.userId, name: id.name, ownsBoardIds: id.ownsBoardIds },
        student: null,
        parent: null,
        primary: "teacher",
      };
    case "student":
      return {
        teacher: null,
        student: { studentId: id.studentId, name: id.name, classroomId: id.classroomId },
        parent: null,
        primary: "student",
      };
    case "parent":
      return {
        teacher: null,
        student: null,
        parent: { parentId: id.parentId, childStudentIds: id.childStudentIds },
        primary: "parent",
      };
    case "anon":
      return { teacher: null, student: null, parent: null, primary: "anon" };
  }
}

export type BoardLike = {
  id: string;
  classroomId: string | null;
  /** classroom.teacherId when present, else BoardMember.role='owner' userId. */
  ownerUserId: string | null;
};

export type CardLike = {
  id: string;
  boardId: string;
  /** Always a teacher (User.id). Null for external/anon cards. */
  authorId: string | null;
  /** Set when a student published the card. */
  studentAuthorId: string | null;
};

// ─── Per-path helpers (do NOT export — callers should use OR'd predicates) ──

function teacherCanReachBoard(t: TeacherIdentity, b: BoardLike): boolean {
  return t.ownsBoardIds.has(b.id);
}

function studentCanReachBoard(s: StudentIdentity, b: BoardLike): boolean {
  return !!b.classroomId && b.classroomId === s.classroomId;
}

function parentHasActiveChildren(p: ParentIdentity): boolean {
  return p.childStudentIds.size > 0;
}

// ─── Public predicates ──────────────────────────────────────────────────────

/** Base eligibility — does any identity on this request get to enumerate
 *  this board? Card-level gating still happens in canViewCard. */
export function isBoardReader(ids: Identities, b: BoardLike): boolean {
  if (ids.teacher && teacherCanReachBoard(ids.teacher, b)) return true;
  if (ids.student && studentCanReachBoard(ids.student, b)) return true;
  // Parents don't browse boards directly — they consume projected pages.
  // Board-level reader=true when they have at least one active child; the
  // caller still filters cards down to the child's authorship.
  if (ids.parent && parentHasActiveChildren(ids.parent)) return true;
  return false;
}

export function canViewCard(
  ids: Identities,
  b: BoardLike,
  c: CardLike
): boolean {
  if (c.boardId !== b.id) return false;
  if (ids.teacher && teacherCanReachBoard(ids.teacher, b)) return true;
  if (ids.student && studentCanReachBoard(ids.student, b)) return true;
  if (
    ids.parent &&
    !!c.studentAuthorId &&
    ids.parent.childStudentIds.has(c.studentAuthorId)
  )
    return true;
  return false;
}

export function canEditCard(
  ids: Identities,
  b: BoardLike,
  c: CardLike
): boolean {
  if (c.boardId !== b.id) return false;
  if (ids.teacher && teacherCanReachBoard(ids.teacher, b)) return true;
  if (
    ids.student &&
    studentCanReachBoard(ids.student, b) &&
    c.studentAuthorId === ids.student.studentId
  )
    return true;
  // Parents never edit. Anon never edits.
  return false;
}

export function canDeleteCard(
  ids: Identities,
  b: BoardLike,
  c: CardLike
): boolean {
  // Same rules as edit in this phase — no separate "delete reserved for
  // owners only" tier. canEditCard already narrows student to own-card.
  return canEditCard(ids, b, c);
}

export function canAddCardToBoard(ids: Identities, b: BoardLike): boolean {
  if (ids.teacher && teacherCanReachBoard(ids.teacher, b)) return true;
  if (ids.student && studentCanReachBoard(ids.student, b)) return true;
  // Parents and anon can't add cards.
  return false;
}

/** Convenience bundle — useful for server components that want to ship a
 *  single `caps` prop to the client instead of the full Identities. */
export type BoardCaps = {
  canAddCard: boolean;
  /** True when the viewer can edit at least their own cards (student) or
   *  any card (teacher owner). Card-level gating still uses canEditCard. */
  canEditOwn: boolean;
};

export function boardCaps(ids: Identities, b: BoardLike): BoardCaps {
  const teacherEdits = !!(ids.teacher && teacherCanReachBoard(ids.teacher, b));
  const studentEdits = !!(ids.student && studentCanReachBoard(ids.student, b));
  return {
    canAddCard: canAddCardToBoard(ids, b),
    canEditOwn: teacherEdits || studentEdits,
  };
}

/** Pick the identity to stamp on a CREATE/UPDATE operation. Reads are
 *  OR'd across all identities, but writes need exactly one owner. */
export function pickWriteIdentity(
  ids: Identities
): "teacher" | "student" | null {
  if (ids.teacher) return "teacher";
  if (ids.student) return "student";
  return null;
}
