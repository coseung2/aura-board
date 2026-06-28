import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolvePortfolioViewer } from "@/lib/portfolio-acl";
import { EXCLUDED_BOARD_LAYOUTS } from "@/lib/portfolio-acl-pure";
import { mapPortfolioCard } from "@/lib/portfolio-card-mapper";
import type {
  PortfolioCardDTO,
  ShowcaseEntryDTO,
} from "@/lib/portfolio-dto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/parent/portfolio?childId=:sid
//
// 학부모 뷰. 응답:
//   - 자녀 본인 카드 (전부)
//   - 자녀 학급의 자랑해요 (자녀 외 학생 카드 포함, 단 자랑해요 슬롯에 걸린
//     것만 — 비-자랑해요 카드는 0건 누출 보장)
//
// 권한: parent session + childId ∈ 활성 ParentChildLink. 그 외 0건.
// AC-8 = 자녀 외 학생 비-자랑해요 카드 0건 검증.
export async function GET(req: Request) {
  const viewer = await resolvePortfolioViewer();
  if (!viewer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (viewer.kind !== "parent") {
    return NextResponse.json({ error: "parent_only" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const childId = searchParams.get("childId");
  if (!childId) {
    return NextResponse.json({ error: "childId_required" }, { status: 400 });
  }
  if (!viewer.childIds.includes(childId)) {
    // 자녀 매핑 없는 학생 ID 는 403 — child boundary 라 cross-student 노출
    // 차단 (parent-scope.ts 의 정책과 일치).
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const child = await db.student.findUnique({
    where: { id: childId },
    select: { id: true, name: true, number: true, classroomId: true },
  });
  if (!child) {
    return NextResponse.json({ error: "child_not_found" }, { status: 404 });
  }

  // 자녀 본인 카드 (작성/공동작성). dj-queue 등 결과물 아닌 카드 제외.
  const ownCards = await db.card.findMany({
    where: {
      AND: [
        {
          OR: [
            { studentAuthorId: childId },
            { authors: { some: { studentId: childId } } },
          ],
        },
        { OR: [{ queueStatus: null }, { queueStatus: { not: "played" } }] },
      ],
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

  // 자녀 학급의 자랑해요. 카드 자체가 EXCLUDED layout 이면 자랑해요였어도
  // 학부모/학생 노출 X (방어적 — POST /api/showcase 가 이미 막지만 과거
  // 데이터 보호).
  const showcase = await db.showcaseEntry.findMany({
    where: {
      classroomId: child.classroomId,
      card: {
        board: { layout: { notIn: [...EXCLUDED_BOARD_LAYOUTS] } },
        OR: [{ queueStatus: null }, { queueStatus: { not: "played" } }],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
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

  const ownCardsDTO: PortfolioCardDTO[] = ownCards.map((c) =>
    mapPortfolioCard(c, null)
  );
  const showcaseDTO: ShowcaseEntryDTO[] = showcase.map((e) => ({
    cardId: e.cardId,
    studentId: e.studentId,
    studentName: e.student.name,
    studentNumber: e.student.number,
    card: mapPortfolioCard(e.card, null),
    createdAt: e.createdAt.toISOString(),
  }));

  return NextResponse.json({
    child: {
      id: child.id,
      name: child.name,
      number: child.number,
      classroomId: child.classroomId,
    },
    ownCards: ownCardsDTO,
    classroomShowcase: showcaseDTO,
  });
}
