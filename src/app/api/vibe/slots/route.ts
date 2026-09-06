// Vibe arcade student slots API (2026-04-21, Phase 1).
// 학급 roster × 각 학생의 최신 VibeProject를 엮어서 "슬롯 그리드"에 공급한다.
// handoff status 4단계(empty/in-progress/needs-review/submitted)로 정규화.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getBoardRole } from "@/lib/rbac";

export type VibeSlotStatus =
  | "empty"
  | "in-progress"
  | "needs-review"
  | "submitted"
  | "returned";

export type VibeSlotDTO = {
  studentId: string;
  studentNumber: number | null;
  studentName: string;
  status: VibeSlotStatus;
  project: null | {
    id: string;
    title: string;
    updatedAt: string;
    thumbnailUrl: string | null;
    moderationStatus: string;
    moderationNote: string | null;
  };
};

function mapStatus(moderation: string | null | undefined): VibeSlotStatus {
  if (!moderation) return "empty";
  if (moderation === "draft") return "in-progress";
  if (moderation === "pending_review") return "needs-review";
  if (moderation === "approved") return "submitted";
  if (moderation === "rejected") return "returned";
  // flagged / hidden → treat as returned (surface action needed) for the teacher panel.
  return "returned";
}

import { withProductFeature } from "@/lib/product-release-server";

export const GET = withProductFeature("developmentLayouts", GETHandler);
async function GETHandler(req: Request) {
  const url = new URL(req.url);
  const boardId = url.searchParams.get("boardId");
  if (!boardId) {
    return NextResponse.json({ error: "boardId required" }, { status: 400 });
  }

  const user = await getCurrentUser().catch(() => null);
  const student = await getCurrentStudent().catch(() => null);
  if (!user && !student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { classroomId: true },
  });
  if (!board || !board.classroomId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (student && board.classroomId !== student.classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (user && !student) {
    const role = await getBoardRole(boardId, user.id);
    if (!role) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const students = await db.student.findMany({
    where: { classroomId: board.classroomId },
    select: { id: true, number: true, name: true },
    orderBy: [{ number: "asc" }, { name: "asc" }],
  });

  // 한 학생이 여러 프로젝트를 만들 수 있음(version bump 등). 최신 1개를 채택.
  const latestProjects = await db.vibeProject.findMany({
    where: {
      boardId,
      authorStudentId: { in: students.map((s) => s.id) },
    },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      updatedAt: true,
      thumbnailUrl: true,
      moderationStatus: true,
      moderationNote: true,
      authorStudentId: true,
    },
  });

  const byAuthor = new Map<string, (typeof latestProjects)[number]>();
  for (const p of latestProjects) {
    if (!byAuthor.has(p.authorStudentId)) byAuthor.set(p.authorStudentId, p);
  }

  const slots: VibeSlotDTO[] = students.map((s) => {
    const p = byAuthor.get(s.id) ?? null;
    return {
      studentId: s.id,
      studentNumber: s.number ?? null,
      studentName: s.name,
      status: mapStatus(p?.moderationStatus),
      project: p
        ? {
            id: p.id,
            title: p.title,
            updatedAt: p.updatedAt.toISOString(),
            thumbnailUrl: p.thumbnailUrl,
            moderationStatus: p.moderationStatus,
            moderationNote: p.moderationNote,
          }
        : null,
    };
  });

  return NextResponse.json({ slots });
}
