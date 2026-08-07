import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonPrivateNoStore } from "@/lib/http-cache";
import { resolvePlayActor } from "@/lib/play-platform/actor";
import {
  PLAY_COMMAND_SCHEMA_VERSION,
  isPlayCommandResponse,
} from "@/lib/play-platform/contracts";
import {
  advanceOmokBotTurn,
  OmokBotTurnError,
} from "@/lib/play-platform/omok-bot-server";
import {
  playEngineFetch,
  proxyPlayEngineResponse,
} from "@/lib/play-platform/server-client";
import { playRouteError } from "@/lib/play-platform/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ sessionId: string }> };

const RequestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);
const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("resign") }),
  z.object({
    type: z.literal("place_stone"),
    position: z.object({
      row: z.number().int().min(0).max(14),
      column: z.number().int().min(0).max(14),
    }),
  }),
]);
const BodySchema = z.object({
  requestId: RequestIdSchema,
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  commandSchemaVersion: z.literal(PLAY_COMMAND_SCHEMA_VERSION),
  command: CommandSchema,
});

export async function POST(request: Request, { params }: Params) {
  try {
    const { sessionId } = await params;
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const actor = await resolvePlayActor();
    const response = await playEngineFetch(
      `/v1/sessions/${encodeURIComponent(sessionId)}/commands`,
      { actor, method: "POST", body: parsed.data },
    );
    if (parsed.data.command.type !== "place_stone" || !response.ok) {
      return proxyPlayEngineResponse(response);
    }

    const payload = (await response.clone().json().catch(() => null)) as unknown;
    if (!isPlayCommandResponse(payload)) return proxyPlayEngineResponse(response);

    try {
      return jsonPrivateNoStore(await advanceOmokBotTurn(sessionId, payload));
    } catch (error) {
      if (!(error instanceof OmokBotTurnError)) throw error;
      console.error("[omok bot turn] failed", {
        sessionId,
        reason: error.message,
      });
      return jsonPrivateNoStore(
        {
          error: "play_engine_unavailable",
          detail: "bot_turn_failed",
          snapshot: payload.snapshot,
        },
        { status: 503 },
      );
    }
  } catch (error) {
    return playRouteError(error);
  }
}
