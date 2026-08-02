import { NextResponse } from "next/server";
import { z } from "zod";
import { resolvePlayActor } from "@/lib/play-platform/actor";
import { playEngineFetch, proxyPlayEngineResponse } from "@/lib/play-platform/server-client";
import { playRouteError } from "@/lib/play-platform/route-utils";
import { SONG_GUESS_COMMAND_SCHEMA_VERSION } from "@/lib/song-guess/contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ sessionId: string }> };
const RequestIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/);
const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open_lobby") }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("unlock_clip") }),
  z.object({ type: z.literal("guess"), text: z.string().max(200) }),
  z.object({ type: z.literal("reveal") }),
  z.object({ type: z.literal("next_round") }),
  z.object({ type: z.literal("finish") }),
]);
const BodySchema = z.object({
  requestId: RequestIdSchema,
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  commandSchemaVersion: z.literal(SONG_GUESS_COMMAND_SCHEMA_VERSION),
  command: CommandSchema,
});

export async function POST(request: Request, { params }: Params) {
  try {
    const { sessionId } = await params;
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
    }
    const actor = await resolvePlayActor();
    const response = await playEngineFetch(
      `/v1/song-guess/sessions/${encodeURIComponent(sessionId)}/commands`,
      { actor, method: "POST", body: parsed.data },
    );
    return proxyPlayEngineResponse(response);
  } catch (error) {
    return playRouteError(error);
  }
}
