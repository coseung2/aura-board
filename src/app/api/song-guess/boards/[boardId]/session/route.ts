import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSongGuessActorForBoard } from "@/lib/play-platform/actor";
import { playEngineFetch } from "@/lib/play-platform/server-client";
import { playRouteError } from "@/lib/play-platform/route-utils";
import {
  buildSongGuessCreateRequest,
  enrichSongGuessPlayEngineResponse,
} from "@/lib/song-guess/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ boardId: string }> };
const RequestIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/);
const CreateSchema = z.object({
  requestId: RequestIdSchema,
  answerMode: z.enum(["text", "multiple-choice"]).default("text"),
  answerTarget: z.enum(["title", "artist", "artist-title"]).default("title"),
  studentIds: z.array(z.string().min(1)).max(100).optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    const { actor } = await resolveSongGuessActorForBoard(boardId);
    const response = await playEngineFetch(
      `/v1/boards/${encodeURIComponent(boardId)}/song-guess/sessions/current`,
      { actor },
    );
    return enrichSongGuessPlayEngineResponse(response);
  } catch (error) {
    return playRouteError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
    }
    const { actor } = await resolveSongGuessActorForBoard(boardId);
    const body = await buildSongGuessCreateRequest(
      boardId,
      parsed.data.requestId,
      parsed.data.studentIds,
      parsed.data.answerMode,
      parsed.data.answerTarget,
    );
    const response = await playEngineFetch(
      `/v1/boards/${encodeURIComponent(boardId)}/song-guess/sessions`,
      { actor, method: "POST", body },
    );
    return enrichSongGuessPlayEngineResponse(response);
  } catch (error) {
    return playRouteError(error);
  }
}
