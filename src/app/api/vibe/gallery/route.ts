// Vibe gallery API (2026-04-21).
// Board.layout === "vibe-gallery" 렌더러가 호출. 한 classroom 내 승인된 프로젝트
// 전체(보드가 달라도)를 pool해서 curation 카드 그리드를 제공.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";

import { withProductFeature } from "@/lib/product-release-server";

export const GET = withProductFeature("developmentLayouts", GETHandler);
async function GETHandler(req: Request) {
  const url = new URL(req.url);
  const classroomId = url.searchParams.get("classroomId");
  if (!classroomId) {
    return NextResponse.json({ error: "classroomId required" }, { status: 400 });
  }
  const take = Math.min(Number(url.searchParams.get("take") ?? 60), 120);

  const user = await getCurrentUser().catch(() => null);
  const student = await getCurrentStudent().catch(() => null);
  if (!user && !student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (student && student.classroomId !== classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (user && !student) {
    // 교사는 본인 소유 classroom만.
    const cls = await db.classroom.findUnique({ where: { id: classroomId } });
    if (!cls || cls.teacherId !== user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const items = await db.vibeProject.findMany({
    where: {
      classroomId,
      moderationStatus: "approved",
    },
    orderBy: [{ createdAt: "desc" }],
    take,
    select: {
      id: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      tags: true,
      playCount: true,
      reviewCount: true,
      ratingAvg: true,
      authorStudentId: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ items });
}
