import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  canViewClassroomShowcase,
  resolvePortfolioViewer,
} from "@/lib/portfolio-acl";
import { EXCLUDED_BOARD_LAYOUTS } from "@/lib/portfolio-acl-pure";
import { mapPortfolioCard } from "@/lib/portfolio-card-mapper";
import type { ShowcaseEntryDTO } from "@/lib/portfolio-dto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/showcase/classroom/:classroomId?limit=N
//
// 학급 자랑해요 목록 (createdAt DESC). limit query param 으로 조회 개수
// 조정 가능 — 기본 30, 최소 1 최대 200. 학생 dashboard strip 은 10,
// 전용 페이지(/student/showcase)는 더 큰 값 사용.
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 200;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ classroomId: string }> }
) {
  const { classroomId } = await params;
  const viewer = await resolvePortfolioViewer();
  if (!viewer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canViewClassroomShowcase(viewer, classroomId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const viewerStudentId = viewer.kind === "student" ? viewer.id : null;

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  let take = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      take = Math.min(parsed, MAX_LIMIT);
    }
  }

  const entries = await db.showcaseEntry.findMany({
    where: {
      classroomId,
      // 방어적 — POST /api/showcase 가 EXCLUDED layout 차단하지만 과거
      // 데이터에 잔존할 가능성 대비. 학생 결과물 컨텍스트 아닌 카드는 학급
      // dashboard highlight 영역에서도 노출 X.
      card: { board: { layout: { notIn: [...EXCLUDED_BOARD_LAYOUTS] } } },
    },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      student: { select: { id: true, name: true, number: true } },
      card: {
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
      },
    },
  });

  const dto: ShowcaseEntryDTO[] = entries.map((e) => ({
    cardId: e.cardId,
    studentId: e.studentId,
    studentName: e.student.name,
    studentNumber: e.student.number,
    card: mapPortfolioCard(e.card, viewerStudentId),
    createdAt: e.createdAt.toISOString(),
  }));

  return NextResponse.json({ entries: dto });
}
