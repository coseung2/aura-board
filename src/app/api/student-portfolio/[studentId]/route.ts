import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canViewStudent, resolvePortfolioViewer } from "@/lib/portfolio-acl";
import { EXCLUDED_BOARD_LAYOUTS } from "@/lib/portfolio-acl-pure";
import type { PortfolioStudentDTO } from "@/lib/portfolio-dto";
import { mapPortfolioCard } from "@/lib/portfolio-card-mapper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/student-portfolio/:studentId
//
// 학생 본인이 작성/공동작성한 카드 모두. 시간순(최신 위). N+1 방지로
// board/section/attachments/showcaseEntries 모두 단일 쿼리에 include.
//
// 권한: canViewStudent(viewer, target). parent 의 경우 자녀 본인만.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const { studentId } = await params;
  const viewer = await resolvePortfolioViewer();
  if (!viewer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const target = await db.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, number: true, classroomId: true },
  });
  if (!target) {
    return NextResponse.json({ error: "student_not_found" }, { status: 404 });
  }
  if (!canViewStudent(viewer, target)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 카드 fetch: studentAuthorId = target OR CardAuthor.studentId = target.
  // distinct id 위해 OR 조건 + Map dedup. (Prisma OR 은 join 후 distinct
  // 보장 안 함)
  const viewerStudentId =
    viewer.kind === "student" ? viewer.id : null;
  const cards = await db.card.findMany({
    where: {
      AND: [
        {
          OR: [
            { studentAuthorId: studentId },
            { authors: { some: { studentId } } },
          ],
        },
        { OR: [{ queueStatus: null }, { queueStatus: { not: "played" } }] },
      ],
      // dj-queue 음악 신청 카드는 결과물 아니므로 포트폴리오에서 제외
      board: { layout: { notIn: [...EXCLUDED_BOARD_LAYOUTS] } },
    },
    include: {
      author: { select: { name: true } },
      studentAuthor: { select: { name: true } },
      board: {
        select: { id: true, slug: true, title: true, layout: true, anonymousAuthor: true },
      },
      section: { select: { id: true, title: true } },
      authors: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          studentId: true,
          displayName: true,
          order: true,
        },
      },
      attachments: { orderBy: { order: "asc" } },
      showcaseEntries: { select: { studentId: true } },
      _count: { select: { likes: true, comments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const dto: PortfolioStudentDTO = {
    student: { id: target.id, name: target.name, number: target.number },
    cards: cards.map((c) => mapPortfolioCard(c, viewerStudentId)),
  };
  return NextResponse.json(dto);
}
