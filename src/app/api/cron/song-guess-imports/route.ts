import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { processNextSongGuessImport } from "@/lib/song-guess/import-worker";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 240;
export async function POST(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await processNextSongGuessImport());
}
