import { logAudit } from "@/lib/audit";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import {
  getLiveQuizViewer,
  listLiveQuizSuggestions,
  LiveQuizError,
  submitLiveQuizSuggestion,
} from "@/lib/live-quiz/server";
import { liveQuizQuestionInputSchema } from "@/lib/live-quiz/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getLiveQuizViewer();
  if (!viewer) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return jsonPrivateNoStore({
      suggestions: await listLiveQuizSuggestions(viewer),
    });
  } catch (error) {
    console.error("[GET /api/live-quiz/suggestions]", error);
    return jsonPrivateNoStore(
      { error: "suggestions_unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const viewer = await getLiveQuizViewer();
  if (!viewer) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
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
    const result = await submitLiveQuizSuggestion(viewer, parsed.data);
    await logAudit({
      actorType: viewer.kind,
      actorId: viewer.id,
      action: "live_quiz.question_suggest",
      resourceType: "live_quiz_question",
      resourceId: result.id,
      req: request,
    });
    return jsonPrivateNoStore(result, { status: 201 });
  } catch (error) {
    if (error instanceof LiveQuizError) {
      return jsonPrivateNoStore(
        { error: error.code },
        { status: error.status },
      );
    }
    console.error("[POST /api/live-quiz/suggestions]", error);
    return jsonPrivateNoStore(
      { error: "suggestion_save_failed" },
      { status: 503 },
    );
  }
}
