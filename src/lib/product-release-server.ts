import "server-only";
import { db } from "./db";
import { isAdminEmail } from "./admin";
import { getCurrentUser } from "./auth";
import { getCurrentStudentIdentityRaw } from "./student-auth";
import { canUseProductFeature, type ProductFeature, type ReleaseAudience } from "./product-release";

export type StudentReleaseSubject = {
  classroomId: string;
  classroom?: { teacher?: { email?: string | null } } | null;
};

export async function studentReleaseAudience(student: StudentReleaseSubject): Promise<ReleaseAudience> {
  const knownEmail = student.classroom?.teacher?.email;
  if (knownEmail !== undefined) return { isAdminClassroom: isAdminEmail(knownEmail) };
  const classroom = await db.classroom.findUnique({
    where: { id: student.classroomId },
    select: { teacher: { select: { email: true } } },
  });
  return { isAdminClassroom: isAdminEmail(classroom?.teacher.email) };
}

function denied(status: number) {
  return Response.json({ error: status === 401 ? "unauthorized" : "feature_unavailable" }, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
}

/** Request-bound authorization, not a UI hint. Existing resource RBAC still runs. */
export async function productFeatureDenial(feature: ProductFeature): Promise<Response | null> {
  const user = await getCurrentUser().catch(() => null);
  if (user) return canUseProductFeature(feature, { isAdmin: isAdminEmail(user.email) }) ? null : denied(403);
  const student = await getCurrentStudentIdentityRaw();
  if (!student) return denied(401);
  return canUseProductFeature(feature, await studentReleaseAudience(student)) ? null : denied(403);
}

export function withProductFeature<Args extends unknown[]>(
  feature: ProductFeature,
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    let denial: Response | null;
    try {
      denial = await productFeatureDenial(feature);
    } catch {
      // An unavailable policy lookup must never fall through to a write.
      return Response.json({ error: "feature_check_unavailable" }, {
        status: 503, headers: { "Cache-Control": "private, no-store" },
      });
    }
    return denial ?? handler(...args);
  };
}
