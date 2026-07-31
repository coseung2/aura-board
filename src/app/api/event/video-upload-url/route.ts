/**
 * POST /api/event/video-upload-url  { boardId, token }
 *
 * PUBLIC. Returns a Cloudflare Stream direct_upload URL when
 * CF_ACCOUNT_ID + CF_STREAM_API_TOKEN are set AND board.videoProviders
 * includes "cfstream". Otherwise 501.
 *
 * Uses the same token gating as /submit so random traffic can't drain CF quota.
 *
 * Every upload is tagged with `creator = board:<boardId>` (see
 * `streamCreatorForBoard`). The submit route then requires that tag, which
 * stops a uid minted for board A from being pasted into board B inside the
 * same Cloudflare account. There is no per-applicant identity at this point in
 * the public flow (the submitToken is only issued *after* submit), so the board
 * is the finest-grained stable owner available without a schema change.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tokensEqual } from "@/lib/event/tokens";
import {
  createDirectUploadUrl,
  cfStreamEnabled,
  streamCreatorForBoard,
  CfStreamError,
} from "@/lib/event/cfstream";

export async function POST(req: Request) {
  if (!cfStreamEnabled()) {
    return NextResponse.json({ error: "cfstream_not_configured" }, { status: 501 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const boardId = (raw as { boardId?: unknown })?.boardId;
  const token = (raw as { token?: unknown })?.token;
  if (typeof boardId !== "string" || typeof token !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const board = await db.board.findUnique({ where: { id: boardId } });
  if (!board) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (board.accessMode !== "public-link" || !board.accessToken) {
    return NextResponse.json({ error: "not_public" }, { status: 403 });
  }
  if (!tokensEqual(token, board.accessToken)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
  const providers = (board.videoProviders || "").split(",").map((s) => s.trim());
  if (!providers.includes("cfstream")) {
    return NextResponse.json({ error: "cfstream_disabled_for_board" }, { status: 400 });
  }
  let result;
  try {
    result = await createDirectUploadUrl({
      maxDurationSeconds: board.maxVideoDurationSec ?? null,
      maxSizeMb: board.maxVideoSizeMb ?? null,
      creator: streamCreatorForBoard(board.id),
      // Only non-personal routing data. No applicant name/contact here.
      meta: { boardId: board.id, app: "aura-board-event" },
    });
  } catch (e) {
    // CfStreamError messages are pre-redacted (status + CF codes only).
    console.error("[event/video-upload-url] cfstream create failed", {
      boardId: board.id,
      code: e instanceof CfStreamError ? e.code : "unknown",
      status: e instanceof CfStreamError ? e.status : undefined,
    });
    return NextResponse.json({ error: "cfstream_create_failed" }, { status: 502 });
  }
  if (!result) return NextResponse.json({ error: "cfstream_create_failed" }, { status: 502 });
  return NextResponse.json({ ok: true, ...result });
}
