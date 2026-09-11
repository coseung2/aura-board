import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSongGuessActorForBoard } from "@/lib/play-platform/actor";
import { playEngineFetch, proxyPlayEngineResponse } from "@/lib/play-platform/server-client";
import { playRouteError } from "@/lib/play-platform/route-utils";
import { SONG_GUESS_CATALOG_CATEGORIES } from "@/lib/song-guess/catalog";
import { buildStudentRoomRequest, studentRoomCatalog } from "@/lib/song-guess/student-rooms";
import { enrichSongGuessPlayEngineResponse } from "@/lib/song-guess/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Params = { params: Promise<{ boardId: string }> };
const Create = z.object({
  requestId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/),
  categories: z.array(z.enum(SONG_GUESS_CATALOG_CATEGORIES)).min(1).max(7),
  segment: z.enum(["intro", "highlight"]), count: z.number().int().min(1).max(20),
}).strict();

export async function GET(request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    const { actor } = await resolveSongGuessActorForBoard(boardId);
    if (new URL(request.url).searchParams.get("catalog") === "1") {
      return NextResponse.json(await studentRoomCatalog(boardId), { headers: { "cache-control": "private, no-store" } });
    }
    return proxyPlayEngineResponse(await playEngineFetch(`/v1/boards/${encodeURIComponent(boardId)}/song-guess/sessions`, { actor }));
  } catch (error) { return playRouteError(error); }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    const parsed = Create.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const { actor } = await resolveSongGuessActorForBoard(boardId);
    const body = await buildStudentRoomRequest(boardId, parsed.data.requestId, parsed.data);
    return enrichSongGuessPlayEngineResponse(await playEngineFetch(`/v1/boards/${encodeURIComponent(boardId)}/song-guess/sessions`, { actor, method: "POST", body }));
  } catch (error) { return playRouteError(error); }
}
