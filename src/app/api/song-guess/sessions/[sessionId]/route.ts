import { resolveSongGuessActorForSession } from "@/lib/play-platform/actor";
import { playEngineFetch } from "@/lib/play-platform/server-client";
import { playRouteError } from "@/lib/play-platform/route-utils";
import { enrichSongGuessPlayEngineResponse } from "@/lib/song-guess/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { sessionId } = await params;
    const actor = await resolveSongGuessActorForSession(sessionId);
    const response = await playEngineFetch(
      `/v1/song-guess/sessions/${encodeURIComponent(sessionId)}/snapshot`,
      { actor },
    );
    return enrichSongGuessPlayEngineResponse(response);
  } catch (error) {
    return playRouteError(error);
  }
}
