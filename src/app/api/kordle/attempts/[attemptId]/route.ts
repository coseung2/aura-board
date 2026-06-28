import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { getPublicState } from "@/features/kordle/server/kordleServer";

type Params = { params: Promise<{ attemptId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { attemptId } = await params;
  const student = await getCurrentStudent();
  const user = student ? null : await getCurrentUser().catch(() => null);
  if (!student && !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const state = await getPublicState({
    attemptId,
    studentId: student?.id ?? null,
    vibePlaySessionId: null,
    teacherUserId: user?.id ?? null,
  });
  if (!state) {
    return NextResponse.json({ error: "attempt_not_found" }, { status: 404 });
  }

  return NextResponse.json({ state });
}
