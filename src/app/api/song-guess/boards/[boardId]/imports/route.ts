import { after, NextResponse } from "next/server";
import { z } from "zod";
import { playRouteError } from "@/lib/play-platform/route-utils";
import { listSongGuessImports, enqueueSongGuessImport, editSongGuessImport, materializeSongGuessImport, deleteSongGuessImport } from "@/lib/song-guess/import-server";
import { processNextSongGuessImport } from "@/lib/song-guess/import-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 240;
type Params = { params: Promise<{ boardId: string }> };
const headers = { "cache-control": "private, no-store" };
const Post = z.discriminatedUnion("action", [
  z.object({ action: z.literal("import"), link: z.string().max(2000) }),
  z.object({ action: z.literal("materialize"), id: z.string().min(1).max(128) }),
]);
const Edit = z.object({ id: z.string().min(1).max(128), title: z.string().trim().min(1).max(200), artist: z.string().trim().min(1).max(200) });

export async function GET(_request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    const items = await listSongGuessImports(boardId);
    if (items.some(item => ["queued", "processing"].includes(item.status))) after(() => processNextSongGuessImport(boardId).then(() => undefined));
    return NextResponse.json({ items }, { headers });
  } catch (error) { return playRouteError(error); }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const body = Post.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "invalid_import_request" }, { status: 400 });
    const { boardId } = await params;
    if (body.data.action === "materialize") return NextResponse.json(await materializeSongGuessImport(boardId, body.data.id), { headers });
    const item = await enqueueSongGuessImport(boardId, body.data.link);
    after(() => processNextSongGuessImport(boardId).then(() => undefined));
    return NextResponse.json({ item }, { status: 202, headers });
  } catch (error) { return playRouteError(error); }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const body = Edit.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "invalid_import_metadata" }, { status: 400 });
    const { boardId } = await params;
    return NextResponse.json({ item: await editSongGuessImport(boardId, body.data.id, body.data.title, body.data.artist) }, { headers });
  } catch (error) { return playRouteError(error); }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const body = z.object({ id: z.string().min(1).max(128) }).safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "invalid_import_request" }, { status: 400 });
    await deleteSongGuessImport((await params).boardId, body.data.id);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return playRouteError(error); }
}
