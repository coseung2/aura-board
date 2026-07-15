import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDailyBanner, getKstDay } from "@/lib/daily-banner";
import { withParentScope } from "@/lib/parent-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
};

// GET /api/parent/daily-banner/current
// Uses the selected child's classroom. When studentId is omitted (for parent
// screens without a child selector), the parent's first active child is used.
export async function GET(req: Request) {
  const requestedStudentId =
    new URL(req.url).searchParams.get("studentId")?.trim() || null;

  const response = await withParentScope(req, async (ctx) => {
    const day = getKstDay();
    if (!requestedStudentId && ctx.childLinks.length > 1) {
      return NextResponse.json(
        { error: "student_id_required" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const studentId = requestedStudentId ?? ctx.childLinks[0]?.studentId ?? null;
    if (!studentId) {
      return NextResponse.json(
        { day, banner: null },
        { headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    if (!ctx.childIds.has(studentId)) {
      return NextResponse.json(
        { error: "forbidden_student" },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { classroomId: true },
    });
    if (!student) {
      return NextResponse.json(
        { error: "student_not_found" },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const banner = await getDailyBanner(student.classroomId, day);
    return NextResponse.json(
      { day, studentId, classroomId: student.classroomId, banner },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  });
  response.headers.set("Cache-Control", PRIVATE_NO_STORE_HEADERS["Cache-Control"]);
  response.headers.set("Vary", PRIVATE_NO_STORE_HEADERS.Vary);
  return response;
}
