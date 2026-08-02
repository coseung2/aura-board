import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  abandonKordleAttempt,
  getPublicState,
} from "@/features/kordle/server/kordleServer";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { IdempotencyConflictError } from "@/lib/game-platform/idempotency";

type Params = { params: Promise<{ attemptId: string }> };

const ActionSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    action: z.literal("abandon"),
  })
  .strict();

export async function GET(_req: Request, { params }: Params) {
  const { attemptId } = await params;
  const student = await getCurrentStudent();
  const user = student ? null : await getCurrentUser().catch(() => null);
  if (!student && !user) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }

  const state = await getPublicState({
    attemptId,
    studentId: student?.id ?? null,
    vibePlaySessionId: null,
    teacherUserId: user?.id ?? null,
  });
  if (!state) {
    return jsonPrivateNoStore({ error: "attempt_not_found" }, { status: 404 });
  }

  return jsonPrivateNoStore({ state });
}

export async function PATCH(req: Request, { params }: Params) {
  const { attemptId } = await params;
  const student = await getCurrentStudent();
  if (!student) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonPrivateNoStore(
      { error: "bad_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await abandonKordleAttempt({
      attemptId,
      requestId: parsed.data.requestId,
      expectedVersion: parsed.data.expectedVersion,
      actorSubject: `student:${student.id}`,
      studentId: student.id,
    });
    if (!result.ok) {
      const status =
        result.reason === "forbidden"
          ? 403
          : result.reason === "attempt_not_found"
            ? 404
            : result.reason === "version_conflict"
              ? 409
              : 400;
      return jsonPrivateNoStore(
        {
          error: result.reason,
          ...(result.state ? { state: result.state } : {}),
          replayed: result.replayed,
        },
        { status },
      );
    }
    return jsonPrivateNoStore({
      ...result.response,
      replayed: result.replayed,
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return jsonPrivateNoStore({ error: error.code }, { status: error.status });
    }
    console.error("[PATCH /api/kordle/attempts/:attemptId]", error);
    return jsonPrivateNoStore({ error: "internal_error" }, { status: 500 });
  }
}
