// Vibe-arcade reviews (Seed 13, AC-F4 / AC-U2 / R-10).
// POST /api/vibe/reviews?projectId=...  — student submits a review for a project.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { scheduleRealtimePublish } from "@/lib/realtime-server";
import { VibeReviewCreateSchema } from "@/lib/vibe-arcade/types";
import { scanText } from "@/lib/vibe-arcade/moderation-filter";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const student = await getCurrentStudent();
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = VibeReviewCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { rating, comment } = parsed.data;

  const project = await db.vibeProject.findUnique({ where: { id: projectId } });
  if (!project || project.moderationStatus !== "approved") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (project.authorStudentId === student.id) {
    return NextResponse.json({ error: "self_review_forbidden" }, { status: 400 });
  }
  if (project.classroomId !== student.classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const scan = scanText(comment);
  const moderationStatus = scan.pass ? "visible" : "flagged";

  try {
    const review = await db.vibeReview.create({
      data: {
        projectId,
        reviewerStudentId: student.id,
        rating,
        comment,
        moderationStatus,
      },
    });

    // Recompute project aggregates — server-side single query for correctness.
    const agg = await db.vibeReview.aggregate({
      where: { projectId, moderationStatus: "visible" },
      _avg: { rating: true },
      _count: { id: true },
    });

    await db.vibeProject.update({
      where: { id: projectId },
      data: {
        reviewCount: agg._count.id,
        ratingAvg: agg._avg.rating,
      },
    });

    scheduleRealtimePublish({
      channel: `board:${project.boardId}:vibe-arcade`,
      type: "review.created",
      payload: {
        projectId,
        ratingAvg: agg._avg.rating,
        reviewCount: agg._count.id,
      },
    });

    return NextResponse.json({ id: review.id, moderationStatus });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
    }
    throw err;
  }
}
