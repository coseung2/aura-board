import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PortfolioPage } from "@/components/portfolio/PortfolioPage";
import type { PortfolioRosterDTO } from "@/lib/portfolio-dto";

export const dynamic = "force-dynamic";

// Teacher-facing classroom portfolio (2026-07-27). The dashboard's portfolio
// list links here with ?student=<id> so a teacher lands on that student's card
// grid. Card details are fetched client-side through /api/student-portfolio,
// which enforces the same viewer ACL as the student portal.
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ student?: string }>;
};

export default async function ClassroomPortfolioPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const { student: requestedStudentId } = await searchParams;
  const user = await getCurrentUser();

  const classroom = await db.classroom.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      teacherId: true,
      students: {
        orderBy: [{ number: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, number: true },
      },
    },
  });
  if (!classroom || classroom.teacherId !== user.id) notFound();

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
    WHERE s."classroomId" = ${classroom.id}
    GROUP BY s.id
  `;
  const cardCountById = new Map(
    counts.map((row) => [row.studentId, Number(row.cardCount)]),
  );

  const initialRoster: PortfolioRosterDTO = {
    classroom: { id: classroom.id, name: classroom.name },
    students: classroom.students.map((student) => ({
      id: student.id,
      name: student.name,
      number: student.number,
      cardCount: cardCountById.get(student.id) ?? 0,
    })),
  };

  const defaultStudentId =
    requestedStudentId &&
    classroom.students.some((student) => student.id === requestedStudentId)
      ? requestedStudentId
      : null;

  return (
    <main className="student-page-portfolio-shell">
      <PortfolioPage
        initialRoster={initialRoster}
        selfStudentId={null}
        defaultStudentId={defaultStudentId}
      />
    </main>
  );
}
