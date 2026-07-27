import { notFound } from "next/navigation";
import { ClassroomDashboardSections } from "@/components/classroom/ClassroomDashboardSections";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { loadClassroomDefaultGroups } from "@/lib/default-groups";

type Props = {
  params: Promise<{ id: string }>;
};

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

export default async function ClassroomDashboardPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();

  const classroom = await db.classroom.findUnique({
    where: { id },
    include: {
      students: {
        orderBy: [{ number: "asc" }, { createdAt: "asc" }],
        include: {
          roleAssignments: {
            include: { classroomRole: true },
            orderBy: { assignedAt: "desc" },
          },
          cardsAuthored: {
            where: {
              OR: [{ queueStatus: null }, { queueStatus: { not: "played" } }],
            },
            select: { id: true },
          },
          assets: {
            select: { id: true },
          },
        },
      },
      currency: true,
      boards: {
        select: {
          id: true,
          slug: true,
          title: true,
          layout: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!classroom || classroom.teacherId !== user.id) {
    notFound();
  }

  // Boards the teacher owns or that are linked to this classroom (link picker).
  const [seatingGroups, allBoardRows] = await Promise.all([
    loadClassroomDefaultGroups(db, classroom.id),
    db.board.findMany({
      where: {
        OR: [
          { members: { some: { userId: user.id, role: "owner" } } },
          { classroomId: id },
        ],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        layout: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const authoredCardCounts = await db.card.groupBy({
    by: ["studentAuthorId"],
    where: {
      studentAuthorId: { not: null },
      studentAuthor: { classroomId: id },
      OR: [{ queueStatus: null }, { queueStatus: { not: "played" } }],
    },
    _count: { _all: true },
  });

  const authoredCountByStudent = new Map(
    authoredCardCounts
      .filter((row) => row.studentAuthorId)
      .map((row) => [row.studentAuthorId!, row._count._all]),
  );

  const unit = classroom.currency?.unitLabel ?? "원";
  const students = classroom.students;
  const studentsWithRole = students.filter(
    (student) => student.roleAssignments.length > 0,
  ).length;

  // The dashboard lists every student; sections are ranked, not truncated.
  const portfolioRows = students
    .map((student) => ({
      id: student.id,
      number: student.number,
      name: student.name,
      cardCount:
        authoredCountByStudent.get(student.id) ?? student.cardsAuthored.length,
      assetCount: student.assets.length,
    }))
    .sort(
      (a, b) =>
        b.cardCount + b.assetCount - (a.cardCount + a.assetCount),
    );

  const totalPortfolioItems = students.reduce(
    (sum, student) =>
      sum +
      (authoredCountByStudent.get(student.id) ?? student.cardsAuthored.length) +
      student.assets.length,
    0,
  );
  const studentsWithPortfolio = students.filter(
    (student) =>
      (authoredCountByStudent.get(student.id) ??
        student.cardsAuthored.length) +
        student.assets.length >
      0,
  ).length;
  const assignedRoleCount = new Set(
    students.flatMap((student) =>
      student.roleAssignments.map(
        (assignment) => assignment.classroomRole?.id ?? assignment.id,
      ),
    ),
  ).size;

  const linkedBoards = classroom.boards.map((board) => ({
    id: board.id,
    slug: board.slug,
    title: board.title,
    layout: board.layout,
    updatedAt: board.updatedAt.toISOString(),
  }));
  const allBoards = allBoardRows.map((board) => ({
    id: board.id,
    slug: board.slug,
    title: board.title,
    layout: board.layout,
    updatedAt: board.updatedAt.toISOString(),
  }));
  const seatingStudents = students.map((student) => ({
    id: student.id,
    name: student.name,
    number: student.number,
    gender: student.gender,
  }));

  return (
    <main className="classroom-page classroom-page-detail classroom-section-page">
      <ClassroomDashboardSections
        classroomId={id}
        classroomName={classroom.name}
        unit={unit}
        sectionKpis={{
          students: [
            { label: "학생 수", value: `${students.length}명` },
            { label: "연결 보드", value: `${linkedBoards.length}개` },
            { label: "학급 코드", value: classroom.code },
          ],
          groups: [
            { label: "학생 수", value: `${seatingStudents.length}명` },
            { label: "저장된 모둠", value: `${seatingGroups.length}개` },
          ],
          boards: [
            { label: "연결 보드", value: `${linkedBoards.length}개` },
            { label: "전체 보드", value: `${allBoards.length}개` },
          ],
          // 금융 관리 renders its own summary (ClassroomBankTab), so the
          // section KPI strip stays empty to avoid duplicate totals.
          bank: [],
        }}
        rosterClassroom={{
          id: classroom.id,
          name: classroom.name,
          code: classroom.code,
          students: students.map((student) => ({
            id: student.id,
            number: student.number,
            name: student.name,
            gender: student.gender,
            qrToken: student.qrToken,
            textCode: student.textCode,
            createdAt: student.createdAt.toISOString(),
          })),
          boards: linkedBoards.map((board) => ({
            id: board.id,
            slug: board.slug,
            title: board.title,
            layout: board.layout,
          })),
        }}
        seatingStudents={seatingStudents}
        seatingGroups={seatingGroups}
        linkedBoards={linkedBoards}
        allBoards={allBoards}
        panelKpis={{
          portfolio: [
            { label: "학생 수", value: `${students.length}명` },
            {
              label: "전체 작품",
              value: `${formatNumber(totalPortfolioItems)}개`,
            },
            {
              label: "제출 학생",
              value: `${studentsWithPortfolio}/${students.length}`,
            },
          ],
          roles: [
            {
              label: "1인1역 배정",
              value: `${studentsWithRole}/${students.length}`,
            },
            { label: "등록 역할", value: `${assignedRoleCount}종` },
            {
              label: "미배정 학생",
              value: `${students.length - studentsWithRole}명`,
            },
          ],
          assignments: [
            { label: "학생 수", value: `${students.length}명` },
          ],
          cleaning: [
            { label: "학생 수", value: `${students.length}명` },
            {
              label: "1인1역 배정",
              value: `${studentsWithRole}/${students.length}`,
            },
          ],
        }}
        portfolio={portfolioRows.map((student) => ({
          id: student.id,
          number: student.number,
          name: student.name,
          itemCount: student.cardCount + student.assetCount,
        }))}
      />
    </main>
  );
}
