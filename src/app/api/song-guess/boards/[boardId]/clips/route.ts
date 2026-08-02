import { NextResponse } from "next/server";
import { loadSongGuessTeacherBoard, PlayAccessError } from "@/lib/play-platform/actor";
import { playRouteError } from "@/lib/play-platform/route-utils";
import {
  SONG_GUESS_ALLOWED_MIME_TYPES,
  SONG_GUESS_MAX_CLIP_SIZE_BYTES,
  validateSongGuessClipMetadata,
} from "@/lib/song-guess/contracts";
import { storeSongGuessClip } from "@/lib/song-guess/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ boardId: string }> };
const MAX_MULTIPART_ENVELOPE_BYTES = 64 * 1024;

export async function POST(request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    const { actor } = await loadSongGuessTeacherBoard(boardId);
    if (!actor.userId) throw new PlayAccessError(403, "forbidden");
    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > SONG_GUESS_MAX_CLIP_SIZE_BYTES + MAX_MULTIPART_ENVELOPE_BYTES
    ) {
      return NextResponse.json({ error: "clip_too_large" }, { status: 413 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!isUploadFile(file)) {
      return NextResponse.json({ error: "clip_file_required" }, { status: 400 });
    }
    const assetKind = form.get("assetKind");
    if (assetKind === "source" || assetKind === "original") {
      return NextResponse.json({ error: "source_audio_not_allowed" }, { status: 400 });
    }
    const tierMs = Number(form.get("tierMs"));
    const durationMs = Number(form.get("durationMs"));
    const mimeType = file.type;
    const metadataError = validateSongGuessClipMetadata({
      tierMs,
      mimeType,
      sizeBytes: file.size,
      durationMs,
    });
    if (metadataError) return NextResponse.json({ error: metadataError }, { status: 400 });
    if (!(SONG_GUESS_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
      return NextResponse.json({ error: "invalid_clip_mime_type" }, { status: 400 });
    }
    const clip = await storeSongGuessClip(boardId, file, {
      tierMs,
      mimeType,
      sizeBytes: file.size,
      durationMs,
    });
    return NextResponse.json(clip, { status: 201, headers: { "cache-control": "private, no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof PlayAccessError) return playRouteError(error);
    return playRouteError(error);
  }
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return (
    !!value &&
    typeof value === "object" &&
    typeof value.arrayBuffer === "function" &&
    typeof value.type === "string" &&
    typeof value.size === "number"
  );
}
