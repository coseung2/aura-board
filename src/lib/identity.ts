/**
 * Request-scoped identity resolver. One call per server component /
 * API handler — returns either a single primary identity
 * (`resolveIdentity`, legacy) or the full bundle of all signed-in
 * identities (`resolveIdentities`, multi-identity aware).
 *
 * Multi-identity: a single browser can legitimately carry a NextAuth
 * teacher session, a student_session cookie (from prior testing), and
 * a parent-session cookie for the same email account (if the teacher is also
 * a parent of a student in another classroom). resolveIdentities returns every
 * resolved credential so predicate OR-ing in card-permissions.ts can
 * surface the widest access the caller actually has.
 *
 * Precedence (`primary` field only — NOT used for authz):
 *   NextAuth teacher → student_session → parent_session → anon.
 */
import "server-only";
import { db } from "./db";
import { getCurrentUser } from "./auth";
import { getCurrentStudent } from "./student-auth";
import { getCurrentParent } from "./parent-session";
import { isSameAccountPrincipal } from "./account-principal";
import type {
  Identities,
  Identity,
  TeacherIdentity,
  StudentIdentity,
  ParentIdentity,
} from "./card-permissions";

/**
 * Resolve every identity the request carries. Non-null members must be
 * fed to card-permissions predicates (which OR across them).
 */
export async function resolveIdentities(): Promise<Identities> {
  const [teacherUser, student, parentCtx] = await Promise.all([
    safeCurrentUser(),
    getCurrentStudent(),
    getCurrentParent(),
  ]);

  // Defense in depth for cookies issued before the login-time handoff was
  // added: two different accounts must never contribute permissions to the
  // same request. The teacher session remains the primary session here.
  const compatibleParentCtx =
    teacherUser &&
    parentCtx &&
    !isSameAccountPrincipal(teacherUser.email, parentCtx.parent.email)
      ? null
      : parentCtx;

  let teacher: TeacherIdentity | null = null;
  if (teacherUser) {
    const owned = await db.boardMember.findMany({
      where: { userId: teacherUser.id, role: "owner" },
      select: { boardId: true },
    });
    teacher = {
      userId: teacherUser.id,
      name: teacherUser.name,
      ownsBoardIds: new Set(owned.map((m) => m.boardId)),
    };
  }

  let studentId: StudentIdentity | null = null;
  if (student) {
    studentId = {
      studentId: student.id,
      name: student.name,
      classroomId: student.classroomId,
    };
  }

  let parent: ParentIdentity | null = null;
  if (compatibleParentCtx?.parent) {
    const links = await db.parentChildLink.findMany({
      where: {
        parentId: compatibleParentCtx.parent.id,
        status: "active",
        deletedAt: null,
      },
      select: { studentId: true },
    });
    parent = {
      parentId: compatibleParentCtx.parent.id,
      childStudentIds: new Set(links.map((l) => l.studentId)),
    };
  }

  const primary: Identities["primary"] = teacher
    ? "teacher"
    : studentId
      ? "student"
      : parent
        ? "parent"
        : "anon";

  return { teacher, student: studentId, parent, share: null, primary };
}

/**
 * Legacy single-identity resolver. Delegates to resolveIdentities and
 * collapses to the primary credential. Prefer resolveIdentities for new
 * call sites so multi-identity cases (teacher-who-is-also-parent) work
 * automatically.
 */
export async function resolveIdentity(): Promise<Identity> {
  const ids = await resolveIdentities();
  if (ids.teacher) return { kind: "teacher", ...ids.teacher };
  if (ids.student) return { kind: "student", ...ids.student };
  if (ids.parent) return { kind: "parent", ...ids.parent };
  return { kind: "anon" };
}

/** getCurrentUser throws Unauthenticated in prod when missing session.
 *  Catch and convert to null for identity-resolution path. */
async function safeCurrentUser() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}
