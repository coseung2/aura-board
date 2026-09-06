// GET /api/vibe/moderation?boardId=xxx&status=pending_review|approved|rejected|flagged|hidden|all
// 교사가 코딩 교실 프로젝트의 모더레이션 상태를 일괄 조회하기 위한 엔드포인트.
// 일반 카탈로그(/api/vibe/projects)는 approved만 노출하므로 교사 화면은 이걸 쓴다.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBoardRole } from "@/lib/rbac";

const ALLOWED_STATUSES = new Set([
  "pending_review",
  "approved",
  "rejected",
  "flagged",
  "hidden",
  "draft",
]);

import { withProductFeature } from "@/lib/product-release-server";

export const GET = withProductFeature("developmentLayouts", GETHandler);
async function GETHandler(req: Request) {
  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId");
  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const role = await getBoardRole(boardId, user.id);
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const statusParam = url.searchParams.get("status") ?? "pending_review";
  const status = statusParam === "all" ? undefined : statusParam;
  if (status && !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "bad_status" }, { status: 400 });
  }

  const take = Math.min(Number(url.searchParams.get("take") ?? 50), 100);

  const items = await db.vibeProject.findMany({
    where: {
      boardId,
      ...(status ? { moderationStatus: status } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take,
    select: {
      id: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      tags: true,
      moderationStatus: true,
      moderationNote: true,
      authorStudentId: true,
      createdAt: true,
      updatedAt: true,
      version: true,
      author: { select: { name: true, number: true } },
    },
  });

  // 상태별 개수 요약 (탭 뱃지에 사용).
  const counts = await db.vibeProject.groupBy({
    by: ["moderationStatus"],
    where: { boardId },
    _count: { _all: true },
  });
  const countsByStatus: Record<string, number> = {};
  for (const c of counts) {
    countsByStatus[c.moderationStatus] = c._count._all;
  }

  return NextResponse.json({ items, counts: countsByStatus });
}
