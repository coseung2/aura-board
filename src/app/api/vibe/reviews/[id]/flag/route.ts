// Vibe-arcade review flag (Seed 13, R-10).
// POST: any student (not self) increments flagCount. 3+ → auto-hide.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";

import { withProductFeature } from "@/lib/product-release-server";

export const POST = withProductFeature("developmentLayouts", POSTHandler);
async function POSTHandler(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const student = await getCurrentStudent();
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const review = await db.vibeReview.findUnique({ where: { id } });
  if (!review) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (review.reviewerStudentId === student.id) {
    return NextResponse.json({ error: "self_flag_forbidden" }, { status: 400 });
  }

  const updated = await db.vibeReview.update({
    where: { id },
    data: {
      flagCount: { increment: 1 },
    },
  });

  if (updated.flagCount >= 3 && updated.moderationStatus === "visible") {
    await db.vibeReview.update({
      where: { id },
      data: { moderationStatus: "hidden_by_teacher" },
    });
  }

  return NextResponse.json({ id, flagCount: updated.flagCount });
}
