import "server-only";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getBoardRole } from "@/lib/rbac";

export type SectionMapActor =
  | { kind: "teacher"; userId: string; canEdit: boolean }
  | { kind: "student"; studentId: string; canEdit: boolean };

export type SectionMapAccess = {
  section: {
    id: string;
    boardId: string;
    title: string;
    activityTemplate: string | null;
    board: { classroomId: string | null };
  };
  actor: SectionMapActor;
};

export async function requireSectionMapAccess(
  sectionId: string,
  mode: "view" | "edit",
): Promise<SectionMapAccess | { error: string; status: number }> {
  const section = await db.section.findUnique({
    where: { id: sectionId },
    select: {
      id: true,
      boardId: true,
      title: true,
      activityTemplate: true,
      board: { select: { classroomId: true } },
    },
  });
  if (!section) return { error: "section_not_found", status: 404 };

  const teacher = await getCurrentUser().catch(() => null);
  if (teacher) {
    const role = await getBoardRole(section.boardId, teacher.id);
    const canView = role === "owner" || role === "editor" || role === "viewer";
    const canEdit = role === "owner" || role === "editor";
    if (mode === "view" ? canView : canEdit) {
      return { section, actor: { kind: "teacher", userId: teacher.id, canEdit } };
    }
  }

  const student = await getCurrentStudent();
  if (
    student &&
    section.board.classroomId &&
    student.classroomId === section.board.classroomId
  ) {
    return {
      section,
      actor: { kind: "student", studentId: student.id, canEdit: true },
    };
  }

  return { error: mode === "view" ? "forbidden" : "edit_forbidden", status: 403 };
}
