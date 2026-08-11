import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/classrooms/:id/assignments/archived
// Teacher-only. 마감(아카이빙)된 제출/보드/섹션 과제 목록.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const user = await getCurrentUser();
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (classroom.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [boards, sections, checkTasks, studentCount] = await Promise.all([
    db.board.findMany({
      where: {
        classroomId,
        layout: "assignment",
        assignmentArchivedAt: { not: null },
      },
      select: {
        id: true,
        title: true,
        assignmentDeadline: true,
        assignmentArchivedAt: true,
        _count: {
          select: {
            assignmentSlots: {
              where: {
                submissionStatus: {
                  in: ["assigned", "returned", "orphaned"],
                },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.section.findMany({
      where: {
        assignmentArchivedAt: { not: null },
        board: { classroomId, layout: "columns" },
      },
      select: {
        id: true,
        title: true,
        assignmentPublishedAt: true,
        assignmentArchivedAt: true,
        board: { select: { title: true } },
        cards: {
          select: {
            studentAuthorId: true,
            authors: {
              where: { studentId: { not: null } },
              select: { studentId: true },
            },
          },
        },
      },
      orderBy: { assignmentArchivedAt: "desc" },
    }),
    db.classroomCheckTask.findMany({
      where: { classroomId, isActive: false },
      select: {
        id: true,
        title: true,
        dueDate: true,
        updatedAt: true,
        _count: {
          select: {
            submissions: { where: { submitted: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.student.count({ where: { classroomId } }),
  ]);

  const sectionMissingCounts = sections.map((section) => {
    const studentIdsWithCards = new Set<string>();
    for (const card of section.cards) {
      if (card.studentAuthorId) studentIdsWithCards.add(card.studentAuthorId);
      for (const author of card.authors) {
        if (author.studentId) studentIdsWithCards.add(author.studentId);
      }
    }
    return Math.max(0, studentCount - studentIdsWithCards.size);
  });

  const items = [
    ...checkTasks.map((task) => ({
      id: task.id,
      kind: "check" as const,
      title: task.title,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      archivedAt: task.updatedAt.toISOString(),
      boardName: null,
      missingCount: Math.max(0, studentCount - task._count.submissions),
    })),
    ...boards.map((board) => ({
      id: board.id,
      kind: "board" as const,
      title: board.title,
      dueDate: board.assignmentDeadline
        ? board.assignmentDeadline.toISOString()
        : null,
      archivedAt: board.assignmentArchivedAt!.toISOString(),
      boardName: null,
      missingCount: board._count.assignmentSlots,
    })),
    ...sections.map((section, index) => ({
      id: section.id,
      kind: "section" as const,
      title: `${section.title} (${section.board.title})`,
      dueDate: section.assignmentPublishedAt
        ? section.assignmentPublishedAt.toISOString()
        : null,
      archivedAt: section.assignmentArchivedAt!.toISOString(),
      boardName: section.board.title,
      missingCount: sectionMissingCounts[index],
    })),
  ].sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));

  return NextResponse.json({ items });
}
