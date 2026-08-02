import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveOmokParticipantSeeds,
  resolvePlayActorForBoard,
} from "@/lib/play-platform/actor";
import {
  playEngineFetch,
  proxyPlayEngineResponse,
} from "@/lib/play-platform/server-client";
import { playRouteError } from "@/lib/play-platform/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ boardId: string }> };

const RequestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);
const CreateSchema = z.object({
  requestId: RequestIdSchema,
  studentIds: z.tuple([z.string().min(1), z.string().min(1)]),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    const { actor } = await resolvePlayActorForBoard(boardId);
    const response = await playEngineFetch(
      `/v1/boards/${encodeURIComponent(boardId)}/sessions/current`,
      { actor },
    );
    return proxyPlayEngineResponse(response);
  } catch (error) {
    return playRouteError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { actor } = await resolvePlayActorForBoard(boardId);
    const participants = await resolveOmokParticipantSeeds(
      boardId,
      parsed.data.studentIds,
    );
    const response = await playEngineFetch(
      `/v1/boards/${encodeURIComponent(boardId)}/sessions`,
      {
        actor,
        method: "POST",
        body: { requestId: parsed.data.requestId, participants },
      },
    );
    return proxyPlayEngineResponse(response);
  } catch (error) {
    return playRouteError(error);
  }
}
