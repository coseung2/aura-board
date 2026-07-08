import { getCurrentStudent } from "@/lib/student-auth";
import { db } from "@/lib/db";
import { getStudentDuties } from "@/lib/role-portals";
import { StudentDashboard } from "@/components/StudentDashboard";
import { StudentTopNav } from "@/components/StudentTopNav";
import { cloneStructure } from "@/lib/breakout";
import { isAdminEmail } from "@/lib/admin";
import { redirect } from "next/navigation";
import { parseDateOrNull } from "@/lib/inspector-findings";

export default async function StudentPage() {
  const student = await getCurrentStudent();

  if (!student) {
    redirect("/login?from=/student");
  }

  const [boards, duties, assignmentSections, checkTasks] = await Promise.all([
    db.board.findMany({
      where: { classroomId: student.classroomId },
      include: {
        quizzes: {
          select: { roomCode: true, status: true },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
        breakoutAssignment: {
          include: {
            template: true,
          },
        },
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
      where: {
        classroomId: student.classroomId,
        isActive: true,
      },
      orderBy: [
        { dueDate: "asc" },
        { createdAt: "desc" },
      ],
      select: {
        id: true,
        title: true,
        description: true,
        dueDate: true,
        createdAt: true,
        submissions: {
          where: { studentId: student.id },
          take: 1,
          select: {
            submitted: true,
            checkedAt: true,
            updatedAt: true,
          },
        },
      },
    }),
  ]);

  const streamBreakouts = boards
    .map((board) => {
      const assignment = board.breakoutAssignment;
      if (
        !assignment ||
        board.layout !== "breakout" ||
        assignment.status !== "active"
      ) {
        return null;
      }
      const sourceBoardId = getStreamBreakoutSourceId(assignment.template.key);
      if (!sourceBoardId) return null;
      return { board, assignment, sourceBoardId };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const streamBreakoutBoardIds = new Set(
    streamBreakouts.map((item) => item.board.id),
  );
  const streamBreakoutBySource = new Map<
    string,
    (typeof streamBreakouts)[number]
  >();
  for (const item of streamBreakouts) {
    const current = streamBreakoutBySource.get(item.sourceBoardId);
    if (!current || current.board.createdAt < item.board.createdAt) {
      streamBreakoutBySource.set(item.sourceBoardId, item);
    }
  }

  const breakoutBoardIds = streamBreakouts.map((item) => item.board.id);
  const assignmentIds = streamBreakouts.map((item) => item.assignment.id);
  const breakoutSections: Array<{
    id: string;
    boardId: string;
    title: string;
    order: number;
  }> = [];
  const membershipCounts: Array<{
    assignmentId: string;
    sectionId: string;
    _count: { _all: number };
  }> = [];
  const myMemberships: Array<{ assignmentId: string; sectionId: string }> = [];

  if (breakoutBoardIds.length > 0) {
    const [sectionsResult, countsResult, membershipsResult] = await Promise.all(
      [
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
          where: {
            assignmentId: { in: assignmentIds },
            studentId: student.id,
          },
          select: { assignmentId: true, sectionId: true },
        }),
      ],
    );
    breakoutSections.push(...sectionsResult);
    membershipCounts.push(
      ...countsResult
        .filter((count) => count.assignmentId !== null)
        .map((count) => ({
          assignmentId: count.assignmentId!,
          sectionId: count.sectionId,
          _count: count._count,
        })),
    );
    myMemberships.push(
      ...membershipsResult
        .filter((membership) => membership.assignmentId !== null)
        .map((membership) => ({
          assignmentId: membership.assignmentId!,
          sectionId: membership.sectionId,
        })),
    );
  }

  const sectionsByBoardId = new Map<string, typeof breakoutSections>();
  for (const section of breakoutSections) {
    const list = sectionsByBoardId.get(section.boardId) ?? [];
    list.push(section);
    sectionsByBoardId.set(section.boardId, list);
  }
  const countBySectionId = new Map(
    membershipCounts.map((count) => [count.sectionId, count._count._all]),
  );
  const mySectionByAssignmentId = new Map(
    myMemberships.map((membership) => [
      membership.assignmentId,
      membership.sectionId,
    ]),
  );

  const boardItems = boards
    .filter((b) => !streamBreakoutBoardIds.has(b.id))
    .map((b) => {
      const linkedBreakout = streamBreakoutBySource.get(b.id);
      return {
        id: b.id,
        slug: b.slug,
        title: b.title || "제목 없음",
        layout: b.layout,
        category: b.category,
        thumbnailMode: b.thumbnailMode,
        thumbnailUrl: b.thumbnailUrl,
        quizzes: b.quizzes,
        kordleStatus:
          b.layout === "kordle"
            ? b.kordleGame?.puzzles[0]?.status ?? null
            : null,
        breakout: linkedBreakout
          ? buildDashboardBreakout({
              board: linkedBreakout.board,
              assignment: linkedBreakout.assignment,
              sections: sectionsByBoardId.get(linkedBreakout.board.id) ?? [],
              countBySectionId,
              selectedSectionId:
                mySectionByAssignmentId.get(linkedBreakout.assignment.id) ??
                null,
            })
          : null,
      };
    });

  const assignmentTodos = assignmentSections.flatMap((section) => {
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
        reminderSentAt: section.assignmentReminderSentAt?.toISOString() ?? null,
        submitted: !!submittedCard,
        submittedAt: submittedCard?.createdAt.toISOString() ?? null,
      },
    ];
  });
  // 과제 배부(assignment layout) 보드에서도 학생 슬롯 가져오기
  const assignmentBoardSlots = await db.assignmentSlot.findMany({
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
  });
  const assignmentBoardTodos = assignmentBoardSlots.map((slot) => ({
    id: `assign-${slot.id}`,
    sectionId: slot.boardId,
    boardId: slot.board.id,
    boardSlug: slot.board.slug,
    boardTitle: slot.board.title || "제목 없음",
    sectionTitle: slot.board.title || "과제",
    href: `/board/${slot.board.slug}`,
    assignedAt: slot.createdAt.toISOString(),
    reminderSentAt: null,
    submitted: slot.submissionStatus === "submitted" || slot.submissionStatus === "viewed" || slot.submissionStatus === "reviewed",
    submittedAt: slot.card.updatedAt?.toISOString() ?? slot.card.createdAt.toISOString(),
  }));
  const checkHref = `/classroom/${student.classroomId}/check`;
  const canOpenChecks = duties.some((duty) => duty.href === checkHref);
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
  const allAssignmentTodos = [...assignmentTodos, ...assignmentBoardTodos, ...checkTodos];
  const showDevFeatures = isAdminEmail(student.classroom.teacher.email);

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
        showDevFeatures={showDevFeatures}
      />
      <main className="student-page">
        <StudentDashboard
          studentName={student.name}
          classroomName={student.classroom.name}
          classroomId={student.classroomId}
          boards={boardItems}
          duties={duties}
          assignments={allAssignmentTodos}
          showDevFeatures={showDevFeatures}
        />
      </main>
    </>
  );
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
  board: {
    id: string;
    slug: string;
    title: string;
  };
  assignment: {
    id: string;
    groupCapacity: number;
    template: { structure: unknown };
  };
  sections: Array<{ id: string; title: string; order: number }>;
  countBySectionId: Map<string, number>;
  selectedSectionId: string | null;
}) {
  const structure = cloneStructure(assignment.template.structure);
  const sharedTitles = new Set(
    (structure.sharedSections ?? []).map((s) => s.title),
  );
  const grouped = new Map<
    number,
    Array<{ id: string; title: string; count: number }>
  >();

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
        totalCount: groupSections.reduce(
          (sum, section) => sum + section.count,
          0,
        ),
        sections: groupSections,
      })),
  };
}
