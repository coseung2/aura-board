import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { submitGuess } from "@/features/kordle/server/kordleServer";

const BodySchema = z.object({
  guess: z.string().min(1).max(50),
  guessIndex: z.number().int().min(1).max(20).optional(),
});

type Params = { params: Promise<{ attemptId: string }> };

export async function POST(req: Request, { params }: Params) {
  const { attemptId } = await params;
  const student = await getCurrentStudent();
  const user = student ? null : await getCurrentUser().catch(() => null);
  if (!student && !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await submitGuess({
    attemptId,
    rawGuess: parsed.data.guess,
    expectedGuessIndex: parsed.data.guessIndex,
    studentId: student?.id ?? null,
    vibePlaySessionId: null,
    teacherUserId: user?.id ?? null,
  });
  if (!result.ok) {
    const status =
      result.reason === "forbidden" ? 403 :
      result.reason === "attempt_not_found" ? 404 :
      result.reason === "puzzle_closed" || result.reason === "round_time_expired" ? 409 :
      400;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ state: result.state });
}
