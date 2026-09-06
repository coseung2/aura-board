import "server-only";
import { db } from "../db";
import { getCurrentUser } from "../auth";
import { getCurrentStudent } from "../student-auth";
import { isAdminEmail } from "../admin";
import { canUseProductFeature } from "../product-release";

/** Shared by detail and play: an opaque project id is never a public grant. */
export async function loadAuthorizedVibeProject(boardKey: string, projectId: string) {
  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) return null;
  if (!canUseProductFeature("developmentLayouts", {
    isAdmin: isAdminEmail(user?.email),
    isAdminClassroom: isAdminEmail(student?.classroom?.teacher?.email),
  })) return null;

  const board = await db.board.findFirst({
    where: { OR: [{ id: boardKey }, { slug: boardKey }] },
    select: { id: true, classroomId: true, anonymousAuthor: true },
  });
  if (!board?.classroomId) return null;
  const member = user ? await db.boardMember.findUnique({
    where: { boardId_userId: { boardId: board.id, userId: user.id } },
    select: { role: true },
  }) : null;
  const classroomStudent = student?.classroomId === board.classroomId ? student : null;
  if (!member && !classroomStudent) return null;

  // Include boardId AND classroomId: malformed legacy rows cannot cross tenants.
  const project = await db.vibeProject.findFirst({
    where: { id: projectId, boardId: board.id, classroomId: board.classroomId },
    include: {
      author: { select: { id: true, name: true } },
      reviews: {
        where: { moderationStatus: "visible" },
        orderBy: { createdAt: "desc" },
        include: { reviewer: { select: { name: true } } },
      },
    },
  });
  if (!project) return null;
  const canManage = member?.role === "owner" || member?.role === "editor";
  const isAuthor = classroomStudent?.id === project.authorStudentId;
  const config = await db.vibeArcadeConfig.findUnique({ where: { boardId: board.id } });
  if (!canManage && !isAuthor && (!config?.enabled || project.moderationStatus !== "approved")) {
    return null;
  }

  return {
    project,
    student: classroomStudent,
    canReview: Boolean(classroomStudent && !isAuthor && config?.enabled && project.moderationStatus === "approved"),
    authorName: board.anonymousAuthor && !canManage ? "익명" : project.author.name,
    reviews: project.reviews.map((review) => ({
      id: review.id,
      reviewerName: !canManage && (board.anonymousAuthor || config?.reviewAuthorDisplay !== "named")
        ? "익명" : review.reviewer.name,
      rating: review.rating,
      content: review.comment,
      createdAt: review.createdAt.toISOString(),
    })),
  };
}
