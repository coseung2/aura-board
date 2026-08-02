import { NextResponse } from "next/server";
import { PlayAccessError } from "@/lib/play-platform/actor";
import { playRouteError } from "@/lib/play-platform/route-utils";
import { deleteUploadedSongGuessClip } from "@/lib/song-guess/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ boardId: string; assetId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { boardId, assetId } = await params;
    const deleted = await deleteUploadedSongGuessClip(boardId, assetId);
    return NextResponse.json(
      { deleted },
      { headers: { "cache-control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    if (error instanceof PlayAccessError) return playRouteError(error);
    return playRouteError(error);
  }
}
