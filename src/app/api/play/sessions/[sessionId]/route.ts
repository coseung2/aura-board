import { resolvePlayActor } from "@/lib/play-platform/actor";
import {
  playEngineFetch,
  proxyPlayEngineResponse,
} from "@/lib/play-platform/server-client";
import { playRouteError } from "@/lib/play-platform/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { sessionId } = await params;
    const actor = await resolvePlayActor();
    const response = await playEngineFetch(
      `/v1/sessions/${encodeURIComponent(sessionId)}/snapshot`,
      { actor },
    );
    return proxyPlayEngineResponse(response);
  } catch (error) {
    return playRouteError(error);
  }
}
