import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/student-auth";
import { db } from "@/lib/db";
import { getStudentDuties } from "@/lib/role-portals";

export async function GET() {
  try {
    const student = await getCurrentStudent();
    if (!student) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const [boards, duties, assignmentSections, checkTasks] = await Promise.all([
      db.board.findMany({
        where: { classroomId: student.classroomId },
        select: {
          id: true,
          slug: true,
          title: true,
          layout: true,
          anonymousAuthor: true,
          thumbnailMode: true,
          thumbnailUrl: true,
          boardTheme: true,
          streamSectionsEnabled: true,
          _count: { select: { cards: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      getStudentDuties(student.id),
      db.section.findMany({
        where: {
          assignmentPublishedAt: { not: null },
          board: { classroomId: student.classroomId, layout: "columns" },
        },
        orderBy: [{ assignmentPublishedAt: "desc" }, { order: "asc" }],
        select: {
          id: true,
          title: true,
          assignmentPublishedAt: true,
          assignmentReminderSentAt: true,
          board: { select: { id: true, slug: true, title: true } },
          cards: {
            where: {
              OR: [
                { studentAuthorId: student.id },
                { authors: { some: { studentId: student.id } } },
              ],
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, createdAt: true },
          },
        },
      }),
      db.classroomCheckTask.findMany({
        where: { classroomId: student.classroomId, isActive: true },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          description: true,
          dueDate: true,
          createdAt: true,
          submissions: {
            where: { studentId: student.id },
            take: 1,
            select: { submitted: true, checkedAt: true, updatedAt: true },
          },
        },
      }),
    ]);

    const checkHref = `/classroom/${student.classroomId}/check`;
    const canOpenChecks = duties.some((duty) => duty.href === checkHref);

    const sectionTodos = assignmentSections.flatMap((section) => {
      if (!section.assignmentPublishedAt) return [];
      const submittedCard = section.cards[0] ?? null;
      return [
        {
          id: section.id,
          sectionId: section.id,
          boardId: section.board.id,
          boardSlug: section.board.slug,
          boardTitle: section.board.title || "제목 없음",
          sectionTitle: section.title,
          href: `/board/${section.board.slug}`,
          assignedAt: section.assignmentPublishedAt.toISOString(),
          reminderSentAt:
            section.assignmentReminderSentAt?.toISOString() ?? null,
          submitted: !!submittedCard,
          submittedAt: submittedCard?.createdAt.toISOString() ?? null,
        },
      ];
    });
    const checkTodos = checkTasks.map((task) => {
      const submission = task.submissions[0] ?? null;
      const checkedAt = submission?.checkedAt ?? submission?.updatedAt ?? null;
      return {
        id: `check-${task.id}`,
        sectionId: task.id,
        boardId: `check-${student.classroomId}`,
        boardSlug: student.classroomId,
        boardTitle: task.description || "제출 체크",
        sectionTitle: task.title,
        href: canOpenChecks ? checkHref : null,
        assignedAt: (task.dueDate ?? task.createdAt).toISOString(),
        reminderSentAt: task.dueDate?.toISOString() ?? null,
        submitted: submission?.submitted === true,
        submittedAt: checkedAt?.toISOString() ?? null,
      };
    });
    const assignments = [...sectionTodos, ...checkTodos];

    return NextResponse.json({
      student: {
        id: student.id,
        name: student.name,
        classroom: student.classroom
          ? { id: student.classroom.id, name: student.classroom.name }
          : null,
      },
      boards,
      duties,
      assignments,
    });
  } catch (e) {
    console.error("[GET /api/student/me]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
