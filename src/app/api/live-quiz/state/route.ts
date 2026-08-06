import { jsonPrivateNoStore } from "@/lib/http-cache";
import {
  getLiveQuizViewer,
  LiveQuizError,
  readLiveQuizState,
} from "@/lib/live-quiz/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getLiveQuizViewer();
  if (!viewer) {
    return jsonPrivateNoStore({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return jsonPrivateNoStore(await readLiveQuizState(viewer));
  } catch (error) {
    if (error instanceof LiveQuizError) {
      return jsonPrivateNoStore(
        { error: error.code },
        { status: error.status },
      );
    }
    console.error("[GET /api/live-quiz/state]", error);
    return jsonPrivateNoStore(
      { error: "live_quiz_state_unavailable" },
      { status: 503 },
    );
  }
}
