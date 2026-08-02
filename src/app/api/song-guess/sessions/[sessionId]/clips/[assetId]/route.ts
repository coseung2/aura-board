import { playRouteError } from "@/lib/play-platform/route-utils";
import { loadSongGuessClipResponse } from "@/lib/song-guess/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ sessionId: string; assetId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { sessionId, assetId } = await params;
    return await loadSongGuessClipResponse(sessionId, assetId);
  } catch (error) {
    return playRouteError(error);
  }
}
