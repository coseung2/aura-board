import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ClassroomNav } from "@/components/classroom/ClassroomNav";

type Props = {
  params: Promise<{ id: string }>;
};

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

function cardPreview(card: {
  thumbUrl: string | null;
  imageUrl: string | null;
  linkImage: string | null;
  attachments: Array<{ kind: string; previewUrl: string | null; url: string }>;
}) {
  const imageAttachment = card.attachments.find((a) => a.kind === "image");
  return (
    card.thumbUrl ??
    imageAttachment?.previewUrl ??
    imageAttachment?.url ??
    card.imageUrl ??
    card.linkImage ??
    null
  );
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
          account: {
            include: {
              fixedDeposits: {
                where: { status: "active" },
                orderBy: { maturityDate: "asc" },
              },
            },
          },
          roleAssignments: {
            include: { classroomRole: true },
            orderBy: { assignedAt: "desc" },
          },
          cardsAuthored: {
            select: { id: true },
          },
          assets: {
            select: { id: true },
          },
        },
      },
      currency: true,
    },
  });

  if (!classroom || classroom.teacherId !== user.id) {
    notFound();
  }

  const [showcaseEntries, authoredCardCounts] = await Promise.all([
    db.showcaseEntry.findMany({
      where: { classroomId: id },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        student: { select: { id: true, name: true, number: true } },
        card: {
          include: {
            board: { select: { id: true, slug: true, title: true } },
            attachments: { orderBy: { order: "asc" } },
          },
        },
      },
    }),
    db.card.groupBy({
      by: ["studentAuthorId"],
      where: {
        studentAuthorId: { not: null },
        studentAuthor: { classroomId: id },
      },
      _count: { _all: true },
    }),
  ]);

  const authoredCountByStudent = new Map(
    authoredCardCounts
      .filter((row) => row.studentAuthorId)
      .map((row) => [row.studentAuthorId!, row._count._all])
  );

  const unit = classroom.currency?.unitLabel ?? "원";
  const students = classroom.students;
  const totalBalance = students.reduce((sum, s) => sum + (s.account?.balance ?? 0), 0);
  const activeDeposits = students.flatMap((s) =>
    (s.account?.fixedDeposits ?? []).map((fd) => ({
      ...fd,
      studentName: s.name,
      studentNumber: s.number,
    }))
  );
  const activeDepositTotal = activeDeposits.reduce((sum, fd) => sum + fd.principal, 0);
  const studentsWithRole = students.filter((s) => s.roleAssignments.length > 0).length;

  const topSavings = [...students]
    .sort((a, b) => (b.account?.balance ?? 0) - (a.account?.balance ?? 0))
    .slice(0, 6);

  const portfolioRows = students
    .map((s) => ({
      id: s.id,
      number: s.number,
      name: s.name,
      cardCount: authoredCountByStudent.get(s.id) ?? s.cardsAuthored.length,
      assetCount: s.assets.length,
    }))
    .sort((a, b) => b.cardCount + b.assetCount - (a.cardCount + a.assetCount))
    .slice(0, 8);

  const roleRows = students
    .filter((s) => s.roleAssignments.length > 0)
    .slice(0, 10);

  return (
    <main className="classroom-page classroom-page-detail">
      <a href="/classroom" className="classroom-back-link">
        &larr; 학급 목록
      </a>
      <h1 className="classroom-page-title">{classroom.name}</h1>
      <ClassroomNav classroomId={classroom.id} />

      <section className="classroom-dashboard-hero">
        <div>
          <span className="classroom-dashboard-eyebrow">Class dashboard</span>
          <h2>학급 대시보드</h2>
          <p>자랑해요, 포트폴리오, 적금, 저축, 1인1역 현황을 한 화면에서 확인합니다.</p>
        </div>
        <div className="classroom-dashboard-hero-stats" aria-label="학급 핵심 지표">
          <span>{students.length}명</span>
          <span>{showcaseEntries.length}개 자랑</span>
          <span>{studentsWithRole}명 역할</span>
        </div>
      </section>

      <section className="classroom-dashboard-kpis" aria-label="학급 요약">
        <article className="classroom-dashboard-kpi">
          <span>총 저축</span>
          <strong>{formatNumber(totalBalance)} {unit}</strong>
        </article>
        <article className="classroom-dashboard-kpi">
          <span>활성 적금</span>
          <strong>{activeDeposits.length}건</strong>
        </article>
        <article className="classroom-dashboard-kpi">
          <span>적금 원금</span>
          <strong>{formatNumber(activeDepositTotal)} {unit}</strong>
        </article>
        <article className="classroom-dashboard-kpi">
          <span>1인1역 배정</span>
          <strong>{studentsWithRole}/{students.length}</strong>
        </article>
      </section>

      <div className="classroom-dashboard-grid">
        <section className="classroom-dashboard-panel classroom-dashboard-panel-wide">
          <div className="classroom-dashboard-panel-head">
            <div>
              <span>Showcase</span>
              <h3>자랑해요</h3>
            </div>
          </div>
          {showcaseEntries.length > 0 ? (
            <div className="classroom-showcase-strip">
              {showcaseEntries.map((entry) => {
                const preview = cardPreview(entry.card);
                return (
                  <Link
                    key={entry.id}
                    href={`/board/${entry.card.board.slug}`}
                    className="classroom-showcase-card"
                  >
                    {preview ? <img src={preview} alt="" /> : <div className="classroom-showcase-fallback">작품</div>}
                    <span className="classroom-showcase-overlay">
                      <strong>{entry.card.title || "제목 없음"}</strong>
                      <small>{entry.student.number ?? "-"}번 {entry.student.name} · {entry.card.board.title}</small>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="classroom-dashboard-empty">아직 자랑해요에 올라온 작품이 없습니다.</p>
          )}
        </section>

        <section className="classroom-dashboard-panel">
          <div className="classroom-dashboard-panel-head">
            <div>
              <span>Portfolio</span>
              <h3>학생별 포트폴리오</h3>
            </div>
          </div>
          <div className="classroom-dashboard-list">
            {portfolioRows.map((student) => (
              <Link key={student.id} href={`/classroom/${id}/students`} className="classroom-dashboard-row">
                <span>{student.number ?? "-"}번 {student.name}</span>
                <strong>{student.cardCount + student.assetCount}개</strong>
              </Link>
            ))}
          </div>
        </section>

        <section className="classroom-dashboard-panel">
          <div className="classroom-dashboard-panel-head">
            <div>
              <span>Savings</span>
              <h3>저축 현황</h3>
            </div>
            <Link href={`/classroom/${id}/bank`}>은행</Link>
          </div>
          <div className="classroom-dashboard-list">
            {topSavings.map((student) => (
              <div key={student.id} className="classroom-dashboard-row">
                <span>{student.number ?? "-"}번 {student.name}</span>
                <strong>{formatNumber(student.account?.balance ?? 0)} {unit}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="classroom-dashboard-panel">
          <div className="classroom-dashboard-panel-head">
            <div>
              <span>Fixed deposit</span>
              <h3>적금</h3>
            </div>
          </div>
          <div className="classroom-dashboard-list">
            {activeDeposits.slice(0, 6).map((fd) => (
              <div key={fd.id} className="classroom-dashboard-row">
                <span>{fd.studentNumber ?? "-"}번 {fd.studentName}</span>
                <strong>{formatNumber(fd.principal)} {unit}</strong>
              </div>
            ))}
            {activeDeposits.length === 0 && (
              <p className="classroom-dashboard-empty">진행 중인 적금이 없습니다.</p>
            )}
          </div>
        </section>

        <section className="classroom-dashboard-panel">
          <div className="classroom-dashboard-panel-head">
            <div>
              <span>Class jobs</span>
              <h3>1인1역 현황</h3>
            </div>
            <Link href={`/classroom/${id}/roles`}>역할</Link>
          </div>
          <div className="classroom-role-mini-grid">
            {roleRows.map((student) => {
              const role = student.roleAssignments[0]?.classroomRole;
              return (
                <div key={student.id} className="classroom-role-mini-card">
                  <span className="classroom-role-mini-icon">{role?.emoji ?? "•"}</span>
                  <span>{student.number ?? "-"}번 {student.name}</span>
                  <strong>{role?.labelKo ?? "미배정"}</strong>
                </div>
              );
            })}
            {roleRows.length === 0 && (
              <p className="classroom-dashboard-empty">아직 배정된 역할이 없습니다.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
