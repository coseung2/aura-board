import { jsonPrivateNoStore } from "@/lib/http-cache";
import {
  getLiveQuizViewer,
  LiveQuizError,
  submitLiveQuizAnswer,
} from "@/lib/live-quiz/server";
import { liveQuizAnswerSchema } from "@/lib/live-quiz/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const viewer = await getLiveQuizViewer();
  if (!viewer) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = liveQuizAnswerSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonPrivateNoStore({ error: "invalid_answer" }, { status: 400 });
  }

  try {
    const result = await submitLiveQuizAnswer(viewer, parsed.data);
    return jsonPrivateNoStore(result);
  } catch (error) {
    if (error instanceof LiveQuizError) {
      return jsonPrivateNoStore(
        { error: error.code },
        { status: error.status },
      );
    }
    console.error("[POST /api/live-quiz/answer]", error);
    return jsonPrivateNoStore(
      { error: "answer_save_failed" },
      { status: 503 },
    );
  }
}
