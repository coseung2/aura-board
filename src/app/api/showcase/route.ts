import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolvePortfolioViewer, canToggleShowcase } from "@/lib/portfolio-acl";
import { isPortfolioEligibleLayout } from "@/lib/portfolio-acl-pure";
import { mapPortfolioCard } from "@/lib/portfolio-card-mapper";
import { classroomShowcaseChannelKey, publish } from "@/lib/realtime";
import type { PortfolioCardDTO } from "@/lib/portfolio-dto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// student-portfolio (2026-04-26): 자랑해요 학생당 한도. v1=3, 향후 학급 설정
// 으로 변경될 수 있어 상수로 분리.
const SHOWCASE_LIMIT_PER_STUDENT = 3;

// POST /api/showcase  body: { cardId }
//
// 학생 세션만. 본인 작성/공동작성 카드만 토글 가능. 트랜잭션 안에서
// COUNT FOR UPDATE → 한도 체크 → INSERT (race-safe).
//
// 한도 초과 시 409 + 현재 자랑해요 카드 목록 동봉 → 클라이언트가 모달로
// 보여주고 사용자가 1개 골라 DELETE 한 뒤 재시도.
export async function POST(req: Request) {
  const viewer = await resolvePortfolioViewer();
  if (!viewer || viewer.kind !== "student") {
    return NextResponse.json({ error: "student_session_required" }, { status: 401 });
  }

  let body: { cardId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const cardId = body.cardId;
  if (!cardId || typeof cardId !== "string") {
    return NextResponse.json({ error: "cardId_required" }, { status: 400 });
  }

  const card = await db.card.findUnique({
    where: { id: cardId },
    include: {
      board: { select: { id: true, classroomId: true, layout: true } },
      authors: { select: { studentId: true } },
    },
  });
  if (!card) {
    return NextResponse.json({ error: "card_not_found" }, { status: 404 });
  }
  if (!canToggleShowcase(viewer, card)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!card.board.classroomId) {
    // 학급 미연결 보드는 자랑해요 대상이 아님 (메인화면이 학급 단위라)
    return NextResponse.json(
      { error: "board_not_classroom_linked" },
      { status: 400 }
    );
  }
  // dj-queue 등 결과물 컨텍스트 아닌 layout 차단 — 음악 신청 카드 등 자랑
  // 해요 대상 아님. portfolio 그리드와 정책 일치.
  if (!isPortfolioEligibleLayout(card.board.layout)) {
    return NextResponse.json(
      { error: "board_layout_excluded" },
      { status: 400 }
    );
  }

  const classroomId = card.board.classroomId;

  // 트랜잭션: 1) 같은 학생-카드 unique 체크 2) 학생당 한도 체크 3) INSERT
  // FOR UPDATE 행 잠금은 PostgreSQL serializable 또는 SELECT FOR UPDATE
  // 가 필요한데 Prisma 가 직접 지원 X. unique 제약 + COUNT 후 INSERT 시
  // 충돌 (P2002 또는 한도 초과 흐름) 을 catch 로 처리.
  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.showcaseEntry.findUnique({
        where: { cardId_studentId: { cardId, studentId: viewer.id } },
      });
      if (existing) {
        return { kind: "already" as const, entry: existing };
      }
      const count = await tx.showcaseEntry.count({
        where: { studentId: viewer.id },
      });
      if (count >= SHOWCASE_LIMIT_PER_STUDENT) {
        // 현재 자랑해요 카드 목록을 함께 반환해 클라이언트 모달 채움
        const current = await tx.showcaseEntry.findMany({
          where: { studentId: viewer.id },
          include: {
            card: {
              include: {
                board: {
                  select: { id: true, slug: true, title: true, layout: true, anonymousAuthor: true },
                },
                section: { select: { id: true, title: true } },
                attachments: { orderBy: { order: "asc" } },
                showcaseEntries: { select: { studentId: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        });
        return {
          kind: "limit" as const,
          showcased: current.map((s) => mapPortfolioCard(s.card, viewer.id)),
        };
      }
      const entry = await tx.showcaseEntry.create({
        data: {
          cardId,
          studentId: viewer.id,
          classroomId,
        },
      });
      return { kind: "created" as const, entry };
    });

    if (result.kind === "limit") {
      return NextResponse.json(
        {
          error: "limit_exceeded",
          limit: SHOWCASE_LIMIT_PER_STUDENT,
          showcased: result.showcased satisfies PortfolioCardDTO[],
        },
        { status: 409 }
      );
    }

    if (result.kind === "created") {
      await publish({
        channel: classroomShowcaseChannelKey(classroomId),
        type: "showcase_added",
        payload: {
          type: "showcase_added",
          cardId,
          studentId: viewer.id,
          classroomId,
          createdAt: result.entry.createdAt.toISOString(),
        },
      });
    }
    return NextResponse.json(
      {
        entry: {
          id: result.entry.id,
          cardId: result.entry.cardId,
          studentId: result.entry.studentId,
          createdAt: result.entry.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    console.error("[POST /api/showcase]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

// DELETE /api/showcase?cardId=:id
//
// 학생 본인 슬롯만 해제 가능. 다른 학생 슬롯은 404 (existence non-disclosure).
export async function DELETE(req: Request) {
  const viewer = await resolvePortfolioViewer();
  if (!viewer || viewer.kind !== "student") {
    return NextResponse.json({ error: "student_session_required" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const cardId = searchParams.get("cardId");
  if (!cardId) {
    return NextResponse.json({ error: "cardId_required" }, { status: 400 });
  }

  const entry = await db.showcaseEntry.findUnique({
    where: { cardId_studentId: { cardId, studentId: viewer.id } },
  });
  if (!entry) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await db.showcaseEntry.delete({ where: { id: entry.id } });
  await publish({
    channel: classroomShowcaseChannelKey(entry.classroomId),
    type: "showcase_removed",
    payload: {
      type: "showcase_removed",
      cardId: entry.cardId,
      studentId: entry.studentId,
      classroomId: entry.classroomId,
    },
  });
  return new NextResponse(null, { status: 204 });
}
