import { NextResponse } from "next/server";
import { z } from "zod";
import { loadSongGuessTeacherBoard } from "@/lib/play-platform/actor";
import { playRouteError } from "@/lib/play-platform/route-utils";
import {
  createSongGuessSetupFromCatalog,
  loadSongGuessCatalogSummary,
} from "@/lib/song-guess/catalog-server";
import { SONG_GUESS_CATALOG_CATEGORIES } from "@/lib/song-guess/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ boardId: string }> };

const BodySchema = z.object({
  categories: z
    .array(z.enum(SONG_GUESS_CATALOG_CATEGORIES))
    .max(SONG_GUESS_CATALOG_CATEGORIES.length),
  segment: z.enum(["intro", "highlight"]),
  count: z.number().int().min(1).max(50),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    await loadSongGuessTeacherBoard(boardId);
    const summary = await loadSongGuessCatalogSummary();
    return NextResponse.json(summary, {
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return playRouteError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_catalog_selection", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const result = await createSongGuessSetupFromCatalog(boardId, parsed.data);
    return NextResponse.json(result, {
      status: 201,
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("song_guess_catalog_")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return playRouteError(error);
  }
}
