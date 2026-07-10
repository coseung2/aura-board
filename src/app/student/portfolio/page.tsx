import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { isAdminEmail } from "@/lib/admin";
import { PortfolioPage } from "@/components/portfolio/PortfolioPage";
import { StudentTopNav } from "@/components/StudentTopNav";
import type { PortfolioRosterDTO } from "@/lib/portfolio-dto";

export const dynamic = "force-dynamic";

// student-portfolio (2026-04-26): 학생 포트폴리오 — 좌측 학급 학생 리스트 +
// 우측 선택 학생의 카드 그리드.
//
// roster 는 SSR 로 prefetch (좌측 리스트 즉시 렌더). 학생별 상세 카드는
// 클라이언트에서 fetch.
export default async function StudentPortfolioPage() {
  const student = await getCurrentStudent();
  if (!student) {
    redirect("/login?from=/student/portfolio");
  }

  const classroomId = student.classroomId;
  const [classroom, duties] = await Promise.all([
    db.classroom.findUnique({
      where: { id: classroomId },
      select: { id: true, name: true },
    }),
    getStudentDuties(student.id),
  ]);
  if (!classroom) {
    // 학생 세션은 있는데 학급이 사라진 케이스 — 데이터 정합성 깨짐, login 으로
    redirect("/login?from=/student/portfolio");
  }

  const students = await db.student.findMany({
    where: { classroomId },
    orderBy: [{ number: "asc" }, { name: "asc" }],
    select: { id: true, name: true, number: true },
  });

  // 학생별 카드 수를 한 번에 조회한다.
  // dj-queue 음악 신청은 결과물 아니라 카드 수에서 제외 (API roster 와 동일).
  const counts = await db.$queryRaw<
    Array<{ studentId: string; cardCount: bigint }>
  >`
    SELECT s.id AS "studentId", COUNT(DISTINCT c.id) AS "cardCount"
    FROM "Student" s
    LEFT JOIN "Card" c ON (
      (c."studentAuthorId" = s.id
       OR c.id IN (SELECT "cardId" FROM "CardAuthor" WHERE "studentId" = s.id))
      AND c."boardId" IN (SELECT id FROM "Board" WHERE layout != 'dj-queue')
      AND (c."queueStatus" IS NULL OR c."queueStatus" != 'played')
    )
    WHERE s."classroomId" = ${classroomId}
    GROUP BY s.id
  `;
  const cardCountById = new Map(
    counts.map((r) => [r.studentId, Number(r.cardCount)])
  );
  const initialRoster: PortfolioRosterDTO = {
    classroom: { id: classroom.id, name: classroom.name },
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      number: s.number,
      cardCount: cardCountById.get(s.id) ?? 0,
    })),
  };

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={classroom.name}
        duties={duties}
        showDevFeatures={isAdminEmail(student.classroom.teacher.email)}
      />
      <main className="student-page-portfolio-shell">
        {/* 헤더는 PortfolioPage 가 own — DJ 보드 패턴 일치 (제목 + action 동일
            row, 토글 버튼이 헤더 안에 같이 들어감). */}
        <PortfolioPage
          initialRoster={initialRoster}
          selfStudentId={student.id}
          defaultStudentId={student.id}
        />
      </main>
    </>
  );
}
