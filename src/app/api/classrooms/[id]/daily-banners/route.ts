import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getKstDay,
  kstDayToDate,
  parseKstDay,
  serializeDailyBannerSubmission,
} from "@/lib/daily-banner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}
// GET /api/classrooms/:id/daily-banners?targetDay=YYYY-MM-DD&status=pending
// Teacher-only moderation queue for one classroom and one KST target day.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { id: classroomId } = await params;
  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { id: true, teacherId: true },
  });
  if (!classroom) return json({ error: "not_found" }, 404);
  if (classroom.teacherId !== user.id) return json({ error: "forbidden" }, 403);

  const query = new URL(req.url).searchParams;
  const targetDay = parseKstDay(query.get("targetDay") ?? query.get("day") ?? getKstDay());
  if (!targetDay) return json({ error: "invalid_day" }, 400);

  const statusValue = query.get("status") ?? "pending";
  if (!["all", "pending", "approved", "rejected"].includes(statusValue)) {
    return json({ error: "invalid_status" }, 400);
  }

  const submissions = await db.dailyBannerSubmission.findMany({
    where: {
      classroomId,
      targetDay: kstDayToDate(targetDay),
      ...(statusValue === "all"
        ? {}
        : { status: statusValue as "pending" | "approved" | "rejected" }),
    },
    include: {
      student: { select: { id: true, name: true, number: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return json({
    classroomId,
    targetDay,
    status: statusValue,
    submissions: submissions.map(serializeDailyBannerSubmission),
  });
}
