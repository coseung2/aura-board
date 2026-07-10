import "server-only";

import { cloneStructure } from "./breakout";
import { db } from "./db";
import { getStudentDuties } from "./role-portals";
import type {
  StudentAssignmentTodo,
  StudentHomeBreakout,
  StudentHomePayload,
} from "./student-home-types";

type StudentIdentity = {
  id: string;
  name: string;
  classroomId: string;
  classroom: { id: string; name: string };
};

export async function getStudentHomePayload(
  student: StudentIdentity,
): Promise<StudentHomePayload> {
  const [boards, duties, assignmentSections, checkTasks, assignmentBoardSlots] =
    await Promise.all([
      db.board.findMany({
        where: { classroomId: student.classroomId },
        include: {
          quizzes: {
            select: { roomCode: true, status: true },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
          breakoutAssignment: { include: { template: true } },
          kordleGame: {
            select: {
              puzzles: {
                where: { status: { in: ["DRAFT", "LIVE"] } },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { status: true },
              },
            },
          },
          speedGame: { select: { status: true } },
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
      db.assignmentSlot.findMany({
        where: {
          studentId: student.id,
          board: { classroomId: student.classroomId, layout: "assignment" },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          boardId: true,
          submissionStatus: true,
          createdAt: true,
          card: { select: { id: true, createdAt: true, updatedAt: true } },
          board: { select: { id: true, slug: true, title: true } },
        },
      }),
    ]);

  const streamBreakouts = boards
    .map((board) => {
      const assignment = board.breakoutAssignment;
      if (!assignment || board.layout !== "breakout" || assignment.status !== "active") {
        return null;
      }
      const sourceBoardId = getStreamBreakoutSourceId(assignment.template.key);
      return sourceBoardId ? { board, assignment, sourceBoardId } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const streamBreakoutBoardIds = new Set(streamBreakouts.map((item) => item.board.id));
  const streamBreakoutBySource = new Map<string, (typeof streamBreakouts)[number]>();
  for (const item of streamBreakouts) {
    const current = streamBreakoutBySource.get(item.sourceBoardId);
    if (!current || current.board.createdAt < item.board.createdAt) {
      streamBreakoutBySource.set(item.sourceBoardId, item);
    }
  }

  const breakoutBoardIds = streamBreakouts.map((item) => item.board.id);
  const assignmentIds = streamBreakouts.map((item) => item.assignment.id);
  let breakoutSections: Array<{
    id: string;
    boardId: string;
    title: string;
    order: number;
  }> = [];
  let rawCounts: Array<{
    assignmentId: string | null;
    sectionId: string;
    _count: { _all: number };
  }> = [];
  let rawMemberships: Array<{ assignmentId: string | null; sectionId: string }> = [];
  if (breakoutBoardIds.length > 0) {
    [breakoutSections, rawCounts, rawMemberships] = await Promise.all([
      db.section.findMany({
        where: { boardId: { in: breakoutBoardIds } },
        orderBy: { order: "asc" },
        select: { id: true, boardId: true, title: true, order: true },
      }),
      db.breakoutMembership.groupBy({
        by: ["assignmentId", "sectionId"],
        where: { assignmentId: { in: assignmentIds } },
        _count: { _all: true },
      }),
      db.breakoutMembership.findMany({
        where: { assignmentId: { in: assignmentIds }, studentId: student.id },
        select: { assignmentId: true, sectionId: true },
      }),
    ]);
  }

  const sectionsByBoardId = new Map<string, typeof breakoutSections>();
  for (const section of breakoutSections) {
    const list = sectionsByBoardId.get(section.boardId) ?? [];
    list.push(section);
    sectionsByBoardId.set(section.boardId, list);
  }
  const countBySectionId = new Map(
    rawCounts.map((count) => [count.sectionId, count._count._all]),
  );
  const mySectionByAssignmentId = new Map(
    rawMemberships
      .filter((membership) => membership.assignmentId !== null)
      .map((membership) => [membership.assignmentId!, membership.sectionId]),
  );

  const homeBoards = boards
    .filter((board) => !streamBreakoutBoardIds.has(board.id))
    .map((board) => {
      const linkedBreakout = streamBreakoutBySource.get(board.id);
      return {
        id: board.id,
        slug: board.slug,
        title: board.title || "제목 없음",
        layout: board.layout,
        category: board.category,
        anonymousAuthor: board.anonymousAuthor,
        thumbnailMode: board.thumbnailMode,
        thumbnailUrl: board.thumbnailUrl,
        boardTheme: board.boardTheme,
        streamSectionsEnabled: board.streamSectionsEnabled,
        cardCount: board._count.cards,
        quizzes: board.quizzes,
        kordleStatus:
          board.layout === "kordle" ? board.kordleGame?.puzzles[0]?.status ?? null : null,
        speedGameStatus:
          board.layout === "speed-game" ? board.speedGame?.status ?? "lobby" : null,
        shadowAllianceStatus:
          board.layout === "shadow-alliance" ? ("waiting" as const) : null,
        breakout: linkedBreakout
          ? buildDashboardBreakout({
              board: linkedBreakout.board,
              assignment: linkedBreakout.assignment,
              sections: sectionsByBoardId.get(linkedBreakout.board.id) ?? [],
              countBySectionId,
              selectedSectionId:
                mySectionByAssignmentId.get(linkedBreakout.assignment.id) ?? null,
            })
          : null,
      };
    });

  const columnTodos: StudentAssignmentTodo[] = assignmentSections.flatMap((section) => {
    if (!section.assignmentPublishedAt) return [];
    const submittedCard = section.cards[0] ?? null;
    return [{
      id: section.id,
      sectionId: section.id,
      boardId: section.board.id,
      boardSlug: section.board.slug,
      boardTitle: section.board.title || "제목 없음",
      sectionTitle: section.title,
      href: `/board/${section.board.slug}`,
      assignedAt: section.assignmentPublishedAt.toISOString(),
      reminderSentAt: section.assignmentReminderSentAt?.toISOString() ?? null,
      submitted: Boolean(submittedCard),
      submittedAt: submittedCard?.createdAt.toISOString() ?? null,
    }];
  });
  const assignmentTodos: StudentAssignmentTodo[] = assignmentBoardSlots.map((slot) => ({
    id: `assign-${slot.id}`,
    sectionId: slot.boardId,
    boardId: slot.board.id,
    boardSlug: slot.board.slug,
    boardTitle: slot.board.title || "제목 없음",
    sectionTitle: slot.board.title || "과제",
    href: `/board/${slot.board.slug}`,
    assignedAt: slot.createdAt.toISOString(),
    reminderSentAt: null,
    submitted: ["submitted", "viewed", "reviewed"].includes(slot.submissionStatus),
    submittedAt: slot.card.updatedAt?.toISOString() ?? slot.card.createdAt.toISOString(),
  }));
  const checkHref = `/classroom/${student.classroomId}/check`;
  const canOpenChecks = duties.some((duty) => duty.href === checkHref);
  const checkTodos: StudentAssignmentTodo[] = checkTasks.map((task) => {
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

  return {
    student: {
      id: student.id,
      name: student.name,
      classroom: { id: student.classroom.id, name: student.classroom.name },
    },
    boards: homeBoards,
    duties,
    assignments: [...columnTodos, ...assignmentTodos, ...checkTodos],
  };
}

function getStreamBreakoutSourceId(templateKey: string): string | null {
  const match = /^stream-(.+)-[a-z0-9]+$/i.exec(templateKey);
  return match?.[1] ?? null;
}

function buildDashboardBreakout({
  board,
  assignment,
  sections,
  countBySectionId,
  selectedSectionId,
}: {
  board: { slug: string; title: string };
  assignment: { id: string; groupCapacity: number; template: { structure: unknown } };
  sections: Array<{ id: string; title: string; order: number }>;
  countBySectionId: Map<string, number>;
  selectedSectionId: string | null;
}): StudentHomeBreakout {
  const structure = cloneStructure(assignment.template.structure);
  const sharedTitles = new Set((structure.sharedSections ?? []).map((section) => section.title));
  const grouped = new Map<number, Array<{ id: string; title: string; count: number }>>();
  for (const section of sections) {
    if (sharedTitles.has(section.title)) continue;
    const match = /^모둠\s+(\d+)\s+·\s+(.+)$/.exec(section.title);
    const groupIndex = match ? Number(match[1]) : 0;
    const list = grouped.get(groupIndex) ?? [];
    list.push({
      id: section.id,
      title: match?.[2] ?? section.title,
      count: countBySectionId.get(section.id) ?? 0,
    });
    grouped.set(groupIndex, list);
  }
  return {
    assignmentId: assignment.id,
    boardSlug: board.slug,
    boardTitle: board.title || "브레이크아웃",
    groupCapacity: assignment.groupCapacity,
    selectedSectionId,
    groups: [...grouped.entries()]
      .sort(([a], [b]) => a - b)
      .map(([groupIndex, groupSections]) => ({
        groupIndex,
        entrySectionId: groupSections[0]?.id ?? "",
        totalCount: groupSections.reduce((sum, section) => sum + section.count, 0),
        sections: groupSections,
      })),
  };
}
