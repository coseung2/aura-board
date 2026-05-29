import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBoardRole } from "@/lib/rbac";
import { cloneStructure } from "@/lib/breakout";
import { CardAttachments } from "@/components/CardAttachments";

/**
 * /board/[id]/archive — Teacher read-only archive for a breakout session (BR-9).
 * Aggregates per-group card counts, active-student counts, last activity time.
 */
export default async function BreakoutArchivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const board = await db.board.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true, slug: true, title: true, layout: true, classroomId: true },
  });
  if (!board || board.layout !== "breakout") notFound();

  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return (
      <main className="board-page">
        <div className="forbidden-card">
          <h2>로그인이 필요합니다</h2>
          <p>아카이브는 교사만 열람할 수 있어요.</p>
        </div>
      </main>
    );
  }
  const role = await getBoardRole(board.id, user.id);
  if (role !== "owner") {
    return (
      <main className="board-page">
        <div className="forbidden-card">
          <h2>접근 불가</h2>
          <p>이 아카이브는 보드 소유 교사만 열람할 수 있어요.</p>
        </div>
      </main>
    );
  }

  const assignment = await db.breakoutAssignment.findUnique({
    where: { boardId: board.id },
    include: { template: true },
  });
  if (!assignment) notFound();

  const structure = cloneStructure(assignment.template.structure);
  const sharedTitles = new Set((structure.sharedSections ?? []).map((s) => s.title));

  const [allSections, allCards, allMemberships] = await Promise.all([
    db.section.findMany({
      where: { boardId: board.id },
      orderBy: { order: "asc" },
    }),
    db.card.findMany({
      where: { boardId: board.id },
      orderBy: { updatedAt: "desc" },
      include: {
        attachments: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            kind: true,
            url: true,
            fileName: true,
            fileSize: true,
            mimeType: true,
            order: true,
          },
        },
      },
    }),
    db.breakoutMembership.findMany({
      where: { assignmentId: assignment.id },
      include: { student: { select: { id: true, name: true, number: true } } },
    }),
  ]);

  type GroupSummary = {
    groupIndex: number;
    sections: typeof allSections;
    cardCount: number;
    activeStudents: number;
    lastActivity: Date | null;
    memberNames: string[];
  };

  const groupMap = new Map<number, GroupSummary>();
  for (const s of allSections) {
    if (sharedTitles.has(s.title)) continue;
    const m = /^모둠\s+(\d+)\s+·/.exec(s.title);
    if (!m) continue;
    const gi = Number(m[1]);
    if (!groupMap.has(gi)) {
      groupMap.set(gi, {
        groupIndex: gi,
        sections: [],
        cardCount: 0,
        activeStudents: 0,
        lastActivity: null,
        memberNames: [],
      });
    }
    groupMap.get(gi)!.sections.push(s);
  }

  const authorsByGroup = new Map<number, Set<string>>();
  for (const c of allCards) {
    if (!c.sectionId) continue;
    const sec = allSections.find((s) => s.id === c.sectionId);
    if (!sec) continue;
    const m = /^모둠\s+(\d+)\s+·/.exec(sec.title);
    if (!m) continue;
    const gi = Number(m[1]);
    const g = groupMap.get(gi);
    if (!g) continue;
    g.cardCount++;
    if (!g.lastActivity || c.updatedAt > g.lastActivity) g.lastActivity = c.updatedAt;
    const set = authorsByGroup.get(gi) ?? new Set<string>();
    if (c.authorId) set.add(c.authorId);
    authorsByGroup.set(gi, set);
  }
  for (const [gi, set] of authorsByGroup) {
    const g = groupMap.get(gi);
    if (g) g.activeStudents = set.size;
  }
  for (const m of allMemberships) {
    const sec = allSections.find((s) => s.id === m.sectionId);
    if (!sec) continue;
    const match = /^모둠\s+(\d+)\s+·/.exec(sec.title);
    if (!match) continue;
    const gi = Number(match[1]);
    const g = groupMap.get(gi);
    if (!g) continue;
    g.memberNames.push(
      m.student.number != null ? `${m.student.number}. ${m.student.name}` : m.student.name
    );
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => a.groupIndex - b.groupIndex);

  return (
    <main className="board-page">
      <header className="board-header">
        <div className="board-header-left">
          <Link href={`/board/${board.slug}`} className="board-back-link" aria-label="보드로">
            ←
          </Link>
          <h1 className="board-title">{board.title} · 아카이브</h1>
          <span className="board-layout-badge">
            {assignment.status === "archived" ? "📦 종료됨" : "📋 진행 중"}
          </span>
        </div>
      </header>

      <section style={{ padding: 16 }}>
        <h2 style={{ fontSize: "1.1rem" }}>모둠별 요약</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border,#ddd)" }}>
              <th style={{ textAlign: "left", padding: 6 }}>모둠</th>
              <th style={{ textAlign: "left", padding: 6 }}>학생</th>
              <th style={{ textAlign: "right", padding: 6 }}>카드 수</th>
              <th style={{ textAlign: "right", padding: 6 }}>활동 학생</th>
              <th style={{ textAlign: "right", padding: 6 }}>최근 활동</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.groupIndex} style={{ borderBottom: "1px solid var(--color-border,#eee)" }}>
                <td style={{ padding: 6 }}>모둠 {g.groupIndex}</td>
                <td style={{ padding: 6 }}>
                  {g.memberNames.length > 0 ? g.memberNames.join(", ") : "—"}
                </td>
                <td style={{ padding: 6, textAlign: "right" }}>{g.cardCount}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{g.activeStudents}</td>
                <td style={{ padding: 6, textAlign: "right" }}>
                  {g.lastActivity ? g.lastActivity.toLocaleString("ko-KR") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={{ fontSize: "1.1rem" }}>모둠별 최종 카드</h2>
        {groups.map((g) => (
          <article
            key={g.groupIndex}
            style={{
              border: "1px solid var(--color-border,#ddd)",
              borderRadius: 6,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <h3 style={{ marginTop: 0 }}>모둠 {g.groupIndex}</h3>
            {g.sections.map((s) => {
              const sectionCards = allCards.filter((c) => c.sectionId === s.id);
              const parsed = /^모둠\s+\d+\s+·\s+(.+)$/.exec(s.title);
              return (
                <div key={s.id} style={{ marginBottom: 12 }}>
                  <h4 style={{ fontSize: "0.95rem", marginBottom: 4 }}>
                    {parsed?.[1] ?? s.title}
                  </h4>
                  {sectionCards.length === 0 ? (
                    <p style={{ color: "var(--color-muted,#888)", fontSize: "0.9rem" }}>
                      카드 없음
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                        gap: 8,
                      }}
                    >
                      {sectionCards.map((c) => (
                        <article
                          key={c.id}
                          className="column-card"
                          style={{ backgroundColor: c.color ?? undefined }}
                        >
                          <CardAttachments
                            imageUrl={c.imageUrl}
                            linkUrl={c.linkUrl}
                            linkTitle={c.linkTitle}
                            linkDesc={c.linkDesc}
                            linkImage={c.linkImage}
                            videoUrl={c.videoUrl}
                            fileUrl={c.fileUrl}
                            fileName={c.fileName}
                            fileSize={c.fileSize}
                            fileMimeType={c.fileMimeType}
                            attachments={c.attachments}
                          />
                          <h4 className="padlet-card-title">{c.title}</h4>
                          <p className="padlet-card-content">{c.content}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </article>
        ))}
      </section>
    </main>
  );
}
