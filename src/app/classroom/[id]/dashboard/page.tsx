import { notFound } from "next/navigation";
import { ClassroomDashboardSections } from "@/components/classroom/ClassroomDashboardSections";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

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
    select: {
      id: true,
      name: true,
      code: true,
      teacherId: true,
      _count: {
        select: {
          students: true,
          boards: true,
        },
      },
    },
  });

  if (!classroom || classroom.teacherId !== user.id) {
    notFound();
  }

  const [assignedStudentRows, authoredCardCount, portfolioAssetCount] =
    await Promise.all([
      db.classroomRoleAssignment.findMany({
        where: { classroomId: id },
        select: { studentId: true },
        distinct: ["studentId"],
      }),
      db.card.count({
        where: {
          studentAuthorId: { not: null },
          studentAuthor: { classroomId: id },
          OR: [{ queueStatus: null }, { queueStatus: { not: "played" } }],
        },
      }),
      db.studentAsset.count({
        where: { classroomId: id },
      }),
    ]);

  const portfolioItemCount = authoredCardCount + portfolioAssetCount;

  return (
    <main className="classroom-page classroom-page-detail classroom-section-page">
      <ClassroomDashboardSections
        classroomId={classroom.id}
        classroomName={classroom.name}
        summaryKpis={[
          { label: "학생 수", value: `${classroom._count.students}명` },
          { label: "연결 보드", value: `${classroom._count.boards}개` },
          {
            label: "1인1역 배정",
            value: `${assignedStudentRows.length}/${classroom._count.students}`,
          },
          {
            label: "포트폴리오",
            value: `${formatNumber(portfolioItemCount)}개`,
          },
          { label: "학급 코드", value: classroom.code },
        ]}
      />
    </main>
  );
}
