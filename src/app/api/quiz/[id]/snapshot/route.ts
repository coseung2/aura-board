import { NextResponse } from "next/server";
import { loadQuizRealtimeSnapshot } from "@/lib/quiz-realtime-snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public game-state recovery endpoint. The room itself is already reachable by
 * room code and the payload intentionally excludes correct answers, student
 * identities, and private board data.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const snapshot = await loadQuizRealtimeSnapshot(id);
  if (!snapshot) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
