import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { logAudit } from "@/lib/audit";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import {
  LiveQuizError,
  reviewLiveQuizQuestion,
} from "@/lib/live-quiz/server";
import { liveQuizReviewActionSchema } from "@/lib/live-quiz/validation";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return jsonPrivateNoStore({ error: "forbidden" }, { status: 403 });
  }

  const parsed = liveQuizReviewActionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonPrivateNoStore(
      { error: "invalid_review", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { questionId } = await params;
  const reviewer = { id: user.id, name: user.name?.trim() || user.email };
  try {
    if (parsed.data.action === "approve") {
      await reviewLiveQuizQuestion({
        questionId,
        reviewer,
        action: {
          type: "approve",
          question: parsed.data.question,
          reviewNote: parsed.data.reviewNote,
        },
      });
    } else if (parsed.data.action === "reject") {
      await reviewLiveQuizQuestion({
        questionId,
        reviewer,
        action: { type: "reject", reviewNote: parsed.data.reviewNote },
      });
    } else {
      await reviewLiveQuizQuestion({
        questionId,
        reviewer,
        action: { type: "archive" },
      });
    }

    await logAudit({
      actorType: "admin",
      actorId: user.id,
      action: `admin.live_quiz.question_${parsed.data.action}`,
      resourceType: "live_quiz_question",
      resourceId: questionId,
      req: request,
    });
    return jsonPrivateNoStore({ ok: true, status: parsed.data.action });
  } catch (error) {
    if (error instanceof LiveQuizError) {
      return jsonPrivateNoStore(
        { error: error.code },
        { status: error.status },
      );
    }
    console.error("[PATCH /api/admin/live-quiz/questions/:id]", error);
    return jsonPrivateNoStore(
      { error: "question_review_failed" },
      { status: 503 },
    );
  }
}
