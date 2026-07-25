import { NextResponse } from "next/server";

import { jsonPrivateNoStore } from "@/lib/http-cache";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  claimStudentAttendanceReward,
  getStudentMonthlyAttendance,
  isValidAttendanceDay,
  recordStudentAttendanceVisit,
} from "@/lib/student-attendance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const student = await getCurrentStudent();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  return jsonPrivateNoStore({ attendance: await getStudentMonthlyAttendance(student.id) });
}

export async function POST() {
  const student = await getCurrentStudent();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  const attendance = await recordStudentAttendanceVisit(student);
  return NextResponse.json({ attendance }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Claim the reward for one visited attendance ordinal. */
export async function PATCH(request: Request) {
  const student = await getCurrentStudent();
  if (!student) return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonPrivateNoStore({ error: "invalid_json" }, { status: 400 });
  }
  const day = (body as { day?: unknown } | null)?.day;
  if (typeof day !== "string" || !isValidAttendanceDay(day)) {
    return jsonPrivateNoStore({ error: "invalid_day" }, { status: 400 });
  }

  const attendance = await claimStudentAttendanceReward(student, day);
  return NextResponse.json({ attendance }, { headers: { "Cache-Control": "private, no-store" } });
}
