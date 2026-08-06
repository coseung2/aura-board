import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { createAdminLiveQuizQuestion } from "@/lib/live-quiz/server";
import { liveQuizQuestionInputSchema } from "@/lib/live-quiz/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });
  }

  const parsed = liveQuizQuestionInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonPrivateNoStore(
      { error: "invalid_question", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const id = await createAdminLiveQuizQuestion(
      { id: user.id, name: user.name?.trim() || user.email },
      parsed.data,
    );
    await logAudit({
      actorType: "admin",
      actorId: user.id,
      action: "admin.live_quiz.question_create",
      resourceType: "live_quiz_question",
      resourceId: id,
      req: request,
    });
    return jsonPrivateNoStore({ id, status: "approved" }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/live-quiz/questions]", error);
    return jsonPrivateNoStore(
      { error: "question_create_failed" },
      { status: 503 },
    );
  }
}
