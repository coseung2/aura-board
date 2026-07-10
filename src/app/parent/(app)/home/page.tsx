import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentParent } from "@/lib/parent-session";
import { ParentDashboard } from "@/components/parent/ParentDashboard";
import type { ChildRow } from "@/components/parent/ParentChildSelector";
import { ParentPendingLinks, type ParentPendingLink } from "@/components/parent/ParentPendingLinks";
import { toParentPendingLink } from "@/lib/parent-pending-link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// parent-redesign (2026-04-26): 학부모 대시보드.
// 풀폭 헤더 + 자녀 chip 셀렉터 + 자녀 portfolio 본문(자녀 카드 + 학급
// 자랑해요). DJ 보드 헤더 패턴 일관. /parent/(app)/layout.tsx 가 이미
// 세션 가드 + ParentTopNav 마운트. 본 페이지는 데이터 fetch + 렌더.
export default async function ParentHomePage({
  searchParams,
}: {
  // child=<studentId>   - 다자녀 셀렉터 초기 선택
  // error=forbidden_student - child layout 이 권한 미보유 시 forward
  //                           (기존엔 무시되던 query 를 작은 notice 로 노출)
  searchParams: Promise<{ child?: string; error?: string }>;
}) {
  const current = await getCurrentParent();
  if (!current) redirect("/parent/join?error=session_required");
  const parent = current.parent;

  const links = await db.parentChildLink.findMany({
    where: {
      parentId: parent.id,
      status: { in: ["active", "pending"] },
      deletedAt: null,
    },
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
    orderBy: [{ status: "asc" }, { requestedAt: "asc" }],
  });

  const activeLinks = links.filter((link) => link.status === "active");
  const pendingLinks: ParentPendingLink[] = links
    .filter((link) => link.status === "pending")
    .map((link) => toParentPendingLink(link));

  if (activeLinks.length === 0) {
    return (
      <main className="student-page-portfolio-shell">
        <header className="portfolio-page-header">
          <div className="portfolio-page-header-left">
            <h1 className="portfolio-page-title">환영합니다</h1>
          </div>
        </header>
        {pendingLinks.length > 0 ? (
          <ParentPendingLinks links={pendingLinks} />
        ) : (
          <div className="portfolio-empty" style={{ padding: 48 }}>
            <p>아직 연결된 자녀가 없어요.</p>
            <p className="portfolio-empty-hint">교사에게 학급 초대코드를 받아 자녀를 연결해 주세요.</p>
            <a href="/parent/onboard/match/code" className="portfolio-empty-cta">
              + 자녀 연동하기 →
            </a>
          </div>
        )}
      </main>
    );
  }

  const childRows: ChildRow[] = activeLinks.map((l) => ({
    studentId: l.studentId,
    studentName: l.student.name,
    studentNumber: l.student.number,
    classroomName: l.student.classroom.name,
  }));

  const { child, error } = await searchParams;
  const initialSelectedId =
    (child && childRows.find((c) => c.studentId === child)?.studentId) ??
    childRows[0].studentId;

  // child layout 의 requireParentScopeForStudent 실패 → /parent/home?error=forbidden_student
  // 로 forward 됐을 때만 노출. 다른 error 값은 무시 (오타/남용 방지).
  const showForbiddenNotice = error === "forbidden_student";

  return (
    <main className="student-page-portfolio-shell">
      {showForbiddenNotice ? (
        <div
          className="section-panel-notice"
          role="status"
          aria-live="polite"
          style={{ margin: "16px auto", maxWidth: 640 }}
        >
          해당 자녀에 접근할 권한이 없어요. 연결된 자녀 목록에서 다시 선택해 주세요.
        </div>
      ) : null}
      <ParentDashboard
        children={childRows}
        initialSelectedId={initialSelectedId}
        pendingLinks={pendingLinks}
      />
    </main>
  );
}
