import { db } from "@/lib/db";
import { ParentPortfolioView } from "@/components/portfolio/ParentPortfolioView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// student-portfolio (2026-04-26) parent-side. ChildLayout 가 이미 studentId
// ∈ parent.children 검증 완료 (PV-7 second layer). 이 페이지는 자녀 본인
// 카드 + 학급 자랑해요를 통합 그리드로 노출.
//
// 데이터는 클라이언트에서 /api/parent/portfolio?childId=X 로 fetch.
// AC-8 (자녀 외 학생 비-자랑해요 카드 0건 누출) 은 API 라우트가 보장.

export default async function ParentChildPortfolioPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const child = await db.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      number: true,
      classroom: { select: { name: true } },
    },
  });
  if (!child) {
    return (
      <div style={{ padding: 24 }}>
        <p>자녀 정보를 찾을 수 없어요.</p>
      </div>
    );
  }
  return (
    <ParentPortfolioView
      childId={child.id}
      childName={child.name}
      childNumber={child.number}
      classroomName={child.classroom.name}
    />
  );
}
