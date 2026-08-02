import { NextResponse } from "next/server";
import { z } from "zod";
import { resolvePlayActor } from "@/lib/play-platform/actor";
import {
  playEngineFetch,
  proxyPlayEngineResponse,
} from "@/lib/play-platform/server-client";
import { playRouteError } from "@/lib/play-platform/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ sessionId: string }> };

const BodySchema = z.object({
  requestId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._-]+$/),
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
      `/v1/sessions/${encodeURIComponent(sessionId)}/rematch`,
      { actor, method: "POST", body: parsed.data },
    );
    return proxyPlayEngineResponse(response);
  } catch (error) {
    return playRouteError(error);
  }
}
