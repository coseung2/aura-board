import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentParent } from "@/lib/parent-session";
import { ParentDashboard } from "@/components/parent/ParentDashboard";
import type { ChildRow } from "@/components/parent/ParentChildSelector";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// parent-redesign (2026-04-26): 학부모 대시보드.
// 풀폭 헤더 + 자녀 chip 셀렉터 + 자녀 portfolio 본문(자녀 카드 + 학급
// 자랑해요). DJ 보드 헤더 패턴 일관. /parent/(app)/layout.tsx 가 이미
// 세션 가드 + ParentBottomNav 마운트. 본 페이지는 데이터 fetch + 렌더.
export default async function ParentHomePage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const current = await getCurrentParent();
  if (!current) redirect("/parent/join?error=session_required");
  const parent = current.parent;

  const links = await db.parentChildLink.findMany({
    where: { parentId: parent.id, status: "active", deletedAt: null },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          number: true,
          classroom: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (links.length === 0) {
    return (
      <main className="student-page-portfolio-shell">
        <header className="portfolio-page-header">
          <div className="portfolio-page-header-left">
            <h1 className="portfolio-page-title">환영합니다</h1>
          </div>
        </header>
        <div className="portfolio-empty" style={{ padding: 48 }}>
          <p>📭 아직 연결된 자녀가 없어요.</p>
          <p className="portfolio-empty-hint">교사에게 학급 초대코드를 받아 자녀를 연결해 주세요.</p>
          <a href="/parent/onboard/match/code" className="portfolio-empty-cta">
            + 자녀 연동하기 →
          </a>
        </div>
      </main>
    );
  }

  const childRows: ChildRow[] = links.map((l) => ({
    studentId: l.studentId,
    studentName: l.student.name,
    studentNumber: l.student.number,
    classroomName: l.student.classroom.name,
  }));

  const { child } = await searchParams;
  const initialSelectedId =
    (child && childRows.find((c) => c.studentId === child)?.studentId) ??
    childRows[0].studentId;

  return (
    <main className="student-page-portfolio-shell">
      <ParentDashboard
        children={childRows}
        initialSelectedId={initialSelectedId}
      />
    </main>
  );
}
