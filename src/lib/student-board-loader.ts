import "server-only";
import { db } from "./db";
import { isAdminEmail } from "./admin";
import { canReadLayout } from "./product-release";
import { isOfficialPlayLayout } from "./game-platform/catalog";

/** Called inside the classroom-scoped cache; private student payloads stay out. */
export async function loadStudentBoardBase(classroomId: string, slug: string) {
  const metadata = await db.board.findFirst({
    where: { OR: [{ id: slug }, { slug }], classroomId },
    include: { classroom: { select: { teacherId: true, teacher: { select: { email: true } } } } },
  });
  if (!metadata) return null;
  const audience = { isAdminClassroom: isAdminEmail(metadata.classroom?.teacher?.email) };
  if (!canReadLayout(metadata.layout, audience) || isOfficialPlayLayout(metadata.layout) || metadata.layout === "assignment") {
    // Official games are metadata-only. Assignment details are private and
    // loaded separately for each student, never in this shared cache.
    return { ...metadata, cards: [], sections: [] };
  }
  const graph = await db.board.findFirst({
    where: { id: metadata.id, classroomId },
    select: {
      cards: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        include: {
          author: { select: { name: true } },
          studentAuthor: { select: { name: true } },
          attachments: { orderBy: { order: "asc" } },
          authors: { orderBy: { displayName: "asc" } },
          _count: { select: {
            likes: true,
            comments: { where: { audience: "public", deletedAt: null } },
          } },
        },
      },
      sections: { orderBy: { order: "asc" } },
    },
  });
  return graph ? { ...metadata, ...graph } : null;
}
