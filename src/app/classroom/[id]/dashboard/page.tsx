import { notFound } from "next/navigation";
import { ClassroomDashboardSections } from "@/components/classroom/ClassroomDashboardSections";
import { ClassroomHomeFeatureGrid } from "@/components/classroom/ClassroomHomeFeatureGrid";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getClassroomHomeSummary } from "@/lib/classroom-home-summary";
import { isAdminEmail } from "@/lib/admin";

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
    },
  });

  if (!classroom || classroom.teacherId !== user.id) {
    notFound();
  }

  const summary = await getClassroomHomeSummary(classroom.id);
  const isAdmin = isAdminEmail(user.email);
  const visibleSummary = isAdmin
    ? summary
    : { ...summary, groups: { groupCount: 0, seatedCount: 0 } };

  return (
    <main className="classroom-page classroom-page-detail classroom-section-page">
      <ClassroomDashboardSections
        classroomId={classroom.id}
        classroomName={classroom.name}
        summaryKpis={[
          { label: "학생 수", value: `${summary.students.total}명` },
          { label: "연결 보드", value: `${summary.boards.count}개` },
          {
            label: "1인1역 배정",
            value: `${summary.roles.assignedCount}/${summary.students.total}`,
          },
          {
            label: "포트폴리오",
            value: `${formatNumber(summary.portfolio.itemCount)}개`,
          },
          { label: "학급 코드", value: classroom.code },
        ]}
      />
      <ClassroomHomeFeatureGrid
        classroomId={classroom.id}
        summary={visibleSummary}
        isAdmin={isAdmin}
      />
    </main>
  );
}
