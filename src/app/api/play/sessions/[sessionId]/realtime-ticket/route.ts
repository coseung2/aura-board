import { db } from "@/lib/db";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { resolvePlayActor } from "@/lib/play-platform/actor";
import { isOmokSnapshot } from "@/lib/play-platform/contracts";
import { OMOK_BOT_ACTOR_SUBJECT } from "@/lib/play-platform/omok-bot";
import {
  isOmokRealtimeEnabled,
  issueOmokRealtimeTransport,
} from "@/lib/play-platform/realtime-ticket";
import {
  PlayEngineUnavailableError,
  playEngineFetch,
  proxyPlayEngineResponse,
} from "@/lib/play-platform/server-client";
import { playRouteError } from "@/lib/play-platform/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ sessionId: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    if (!isOmokRealtimeEnabled()) {
      return jsonPrivateNoStore(
        { error: "realtime_disabled" },
        { status: 503 },
      );
    }
    const { sessionId } = await params;
    const actor = await resolvePlayActor();
    const authorized = await playEngineFetch(
      `/v1/sessions/${encodeURIComponent(sessionId)}/snapshot`,
      { actor },
    );
    if (!authorized.ok) return proxyPlayEngineResponse(authorized);
    const snapshot = (await authorized.json().catch(() => null)) as unknown;
    if (!isOmokSnapshot(snapshot) || snapshot.sessionId !== sessionId) {
      throw new PlayEngineUnavailableError("invalid_play_engine_snapshot");
    }

    const bot = await db.playParticipant.findFirst({
      where: { sessionId, actorSubject: OMOK_BOT_ACTOR_SUBJECT },
      select: { id: true },
    });
    if (bot) {
      return jsonPrivateNoStore({
        transport: "http" as const,
        reason: "bot_session" as const,
        pollIntervalMs: 3000 as const,
      });
    }
    return jsonPrivateNoStore(issueOmokRealtimeTransport(actor, sessionId));
  } catch (error) {
    return playRouteError(error);
  }
}
