import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { scanText } from "@/lib/vibe-arcade/moderation-filter";

const ReviewCreateSchema = z.object({
  studentId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  content: z.string().max(500).default(""),
});

async function recomputeProjectReviewStats(projectId: string) {
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
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await db.vibeProject.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const reviews = await db.vibeReview.findMany({
    where: { projectId: id, moderationStatus: "visible" },
    orderBy: { createdAt: "desc" },
    include: { reviewer: { select: { name: true } } },
  });

  return NextResponse.json({
    reviews: reviews.map((review) => ({
      id: review.id,
      reviewerName: review.reviewer.name,
      rating: review.rating,
      content: review.comment,
      createdAt: review.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const student = await getCurrentStudent();
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = ReviewCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { studentId, rating, content } = parsed.data;
  if (studentId !== student.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const project = await db.vibeProject.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (project.classroomId !== student.classroomId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (project.authorStudentId === student.id) {
    return NextResponse.json({ error: "self_review_forbidden" }, { status: 400 });
  }

  const trimmedContent = content.trim();
  const scan = scanText(trimmedContent);
  const moderationStatus = scan.pass ? "visible" : "flagged";

  try {
    const review = await db.vibeReview.create({
      data: {
        projectId: id,
        reviewerStudentId: student.id,
        rating,
        comment: trimmedContent,
        moderationStatus,
      },
      include: { reviewer: { select: { name: true } } },
    });

    await recomputeProjectReviewStats(id);

    return NextResponse.json(
      {
        review: {
          id: review.id,
          reviewerName: review.reviewer.name,
          rating: review.rating,
          content: review.comment,
          createdAt: review.createdAt.toISOString(),
        },
        moderationStatus,
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
    }
    throw err;
  }
}
