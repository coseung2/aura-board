import { NextResponse } from "next/server";
import { z } from "zod";
import { PlayAccessError } from "@/lib/play-platform/actor";
import { playRouteError } from "@/lib/play-platform/route-utils";
import { SONG_GUESS_MAX_ROUNDS } from "@/lib/song-guess/contracts";
import {
  deleteSongGuessSetup,
  loadSongGuessTeacherSetup,
  saveSongGuessSetup,
} from "@/lib/song-guess/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ boardId: string }> };

const BodySchema = z.object({
  rounds: z
    .array(
      z.object({
        representativeAnswer: z.string().trim().min(1).max(200),
        aliases: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
        accessibilityClue: z.string().trim().max(500).nullable().optional(),
        clipAssetIds: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
      }),
    )
    .min(1)
    .max(SONG_GUESS_MAX_ROUNDS),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    const setup = await loadSongGuessTeacherSetup(boardId);
    if (!setup) return NextResponse.json({ error: "song_guess_setup_not_found" }, { status: 404 });
    return NextResponse.json(setup, { headers: { "cache-control": "private, no-store, max-age=0" } });
  } catch (error) {
    return playRouteError(error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request", issues: parsed.error.issues }, { status: 400 });
    }
    const setup = await saveSongGuessSetup(boardId, parsed.data);
    return NextResponse.json(setup, { headers: { "cache-control": "private, no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid_")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof PlayAccessError) return playRouteError(error);
    return playRouteError(error);
  }
}

/** Kept as a compatibility alias for clients that used the original setup POST. */
export async function POST(request: Request, context: Params) {
  return PUT(request, context);
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    const deleted = await deleteSongGuessSetup(boardId);
    return NextResponse.json(
      { deleted },
      { headers: { "cache-control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    if (error instanceof PlayAccessError) return playRouteError(error);
    return playRouteError(error);
  }
}
