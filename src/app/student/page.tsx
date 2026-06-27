import { getCurrentStudent } from "@/lib/student-auth";
import { db } from "@/lib/db";
import { getStudentDuties } from "@/lib/role-portals";
import { StudentDashboard } from "@/components/StudentDashboard";
import { cloneStructure } from "@/lib/breakout";
import { redirect } from "next/navigation";

export default async function StudentPage() {
  const student = await getCurrentStudent();

  if (!student) {
    redirect("/student/login");
  }

  const [boards, duties] = await Promise.all([
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
      },
      orderBy: { createdAt: "desc" },
    }),
    getStudentDuties(student.id),
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

  return (
    <main className="student-page">
      <StudentDashboard
        studentName={student.name}
        classroomName={student.classroom.name}
        classroomId={student.classroomId}
        boards={boardItems}
        duties={duties}
      />
    </main>
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
