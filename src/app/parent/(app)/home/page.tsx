import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentParent } from "@/lib/parent-session";
import { ParentDashboard } from "@/components/parent/ParentDashboard";
import type { ChildRow } from "@/components/parent/ParentChildSelector";
import { ParentPendingLinks, type ParentPendingLink } from "@/components/parent/ParentPendingLinks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const PENDING_EXPIRES_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// parent-redesign (2026-04-26): 학부모 대시보드.
// 풀폭 헤더 + 자녀 chip 셀렉터 + 자녀 portfolio 본문(자녀 카드 + 학급
// 자랑해요). DJ 보드 헤더 패턴 일관. /parent/(app)/layout.tsx 가 이미
// 세션 가드 + ParentTopNav 마운트. 본 페이지는 데이터 fetch + 렌더.
export default async function ParentHomePage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
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
    .map((link) => toPendingLink(link));

  if (activeLinks.length === 0) {
    return (
      <main className="student-page-portfolio-shell">
        <header className="portfolio-page-header">
          <div className="portfolio-page-header-left">
            <h1 className="portfolio-page-title">환영합니다</h1>
          </div>
          <div className="portfolio-page-header-actions">
            <a href="/parent/onboard/match/code" className="portfolio-header-btn">
              <span aria-hidden>＋</span>
              <span>자녀 추가</span>
            </a>
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

  const { child } = await searchParams;
  const initialSelectedId =
    (child && childRows.find((c) => c.studentId === child)?.studentId) ??
    childRows[0].studentId;

  return (
    <main className="student-page-portfolio-shell">
      <ParentDashboard
        children={childRows}
        initialSelectedId={initialSelectedId}
        pendingLinks={pendingLinks}
      />
    </main>
  );
}

function toPendingLink(link: {
  id: string;
  requestedAt: Date;
  student: {
    name: string;
    number: number | null;
    classroom: { name: string };
  };
}): ParentPendingLink {
  const elapsedDays = Math.ceil((Date.now() - link.requestedAt.getTime()) / DAY_MS);
  return {
    id: link.id,
    studentName: link.student.name,
    studentNumber: link.student.number,
    classroomName: link.student.classroom.name,
    requestedAtLabel: formatDate(link.requestedAt),
    expiresInDays: Math.max(0, PENDING_EXPIRES_DAYS - elapsedDays),
  };
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}
