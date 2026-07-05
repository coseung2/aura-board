import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { cloneStructure } from "@/lib/breakout";
import { BreakoutSelectClient } from "@/components/BreakoutSelectClient";

/**
 * /b/[slug]/select - Student self-select landing page (BR-5).
 *
 * Resolves a breakout board by slug, verifies the calling student belongs to
 * the board's classroom, and renders the group grid with current occupancy.
 * Picking a group POSTs to /api/breakout/assignments/[id]/membership.
 */
export default async function BreakoutSelectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const board = await db.board.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    select: {
      id: true,
      slug: true,
      title: true,
      classroomId: true,
      layout: true,
    },
  });
  if (!board || board.layout !== "breakout") notFound();

  const student = await getCurrentStudent();
  if (!student) {
    // Route the student through the universal login page with a return target.
    redirect(`/login?from=${encodeURIComponent(`/b/${board.slug}/select`)}`);
  }
  if (board.classroomId !== student.classroomId) {
    return (
      <main className="board-page">
        <div className="forbidden-card">
          <h2>접근 불가</h2>
          <p>이 보드는 다른 반 학생만 참여할 수 있어요.</p>
        </div>
      </main>
    );
  }

  const assignment = await db.breakoutAssignment.findUnique({
    where: { boardId: board.id },
    include: { template: true },
  });
  if (!assignment) notFound();

  if (assignment.deployMode !== "self-select") {
    return (
      <main className="board-page">
        <div className="forbidden-card">
          <h2>자율 선택 모드가 아니에요</h2>
          <p>
            이 수업은 다른 배포 방식으로 운영 중이에요. 교사 안내를 확인해
            주세요.
          </p>
          <p>
            <Link href={`/board/${board.slug}`}>보드로 이동</Link>
          </p>
        </div>
      </main>
    );
  }

  // Existing membership?
  const mine = await db.breakoutMembership.findFirst({
    where: { assignmentId: assignment.id, studentId: student.id },
  });
  if (mine) {
    redirect(`/board/${board.slug}/s/${mine.sectionId}`);
  }

  // Parse structure to identify group sections (exclude teacher-pool).
  const structure = cloneStructure(assignment.template.structure);
  const sharedTitles = new Set(
    (structure.sharedSections ?? []).map((s) => s.title),
  );

  const allSections = await db.section.findMany({
    where: { boardId: board.id },
    orderBy: { order: "asc" },
    select: { id: true, title: true, order: true },
  });
  const groupSections = allSections.filter((s) => !sharedTitles.has(s.title));

  // Count memberships per section for occupancy display.
  const counts = await db.breakoutMembership.groupBy({
    by: ["sectionId"],
    where: { assignmentId: assignment.id },
    _count: { _all: true },
  });
  const countBySection = new Map(
    counts.map((c) => [c.sectionId, c._count._all]),
  );

  // Regroup "모둠 N · Section" titles so we show 1 row per group index.
  const groupedBy: Record<
    number,
    { id: string; title: string; count: number }[]
  > = {};
  for (const s of groupSections) {
    const m = /^모둠\s+(\d+)\s+·\s+(.+)$/.exec(s.title);
    const gi = m ? Number(m[1]) : 0;
    (groupedBy[gi] ??= []).push({
      id: s.id,
      title: m?.[2] ?? s.title,
      count: countBySection.get(s.id) ?? 0,
    });
  }
  const groups = Object.entries(groupedBy)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([gi, sections]) => ({
      groupIndex: Number(gi),
      sections,
      // Enter via the first section in the group (teacher-facing naming order).
      entrySectionId: sections[0]?.id ?? "",
      totalCount: sections.reduce((sum, s) => sum + s.count, 0),
    }));

  return (
    <main className="board-page">
      <header className="board-header">
        <Link
          href={`/board/${board.slug}`}
          className="board-back-link"
          aria-label="보드로"
        >
          ←
        </Link>
        <h1 className="board-title">{board.title} - 모둠 선택</h1>
      </header>
      <BreakoutSelectClient
        assignmentId={assignment.id}
        boardSlug={board.slug}
        groups={groups}
        groupCapacity={assignment.groupCapacity}
        studentName={student.name}
      />
    </main>
  );
}
