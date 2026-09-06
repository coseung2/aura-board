// Single VibeProject fetch (2026-04-21, Phase 2).
// Studio가 기존 프로젝트 3필드를 읽어오기 위한 최소 엔드포인트. 교사/본인/같은 classroom 학생 모두 읽기 허용(모더레이션 상태 무관 — 비승인이어도 Studio 편집용).
// 단 외부 노출 범위는 제한: 다른 classroom 학생은 forbidden.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getBoardRole } from "@/lib/rbac";

import { withProductFeature } from "@/lib/product-release-server";

export const GET = withProductFeature("developmentLayouts", GETHandler);
async function GETHandler(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const user = await getCurrentUser().catch(() => null);
  const student = await getCurrentStudent().catch(() => null);
  if (!user && !student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const project = await db.vibeProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      boardId: true,
      classroomId: true,
      authorStudentId: true,
      title: true,
      description: true,
      htmlContent: true,
      cssContent: true,
      jsContent: true,
      tags: true,
      moderationStatus: true,
      moderationNote: true,
      updatedAt: true,
    },
  });
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (student && project.classroomId !== student.classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (user && !student) {
    const role = await getBoardRole(project.boardId, user.id);
    if (!role) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json(project);
}
