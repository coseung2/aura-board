import { NextResponse } from "next/server";
import { loadOmokRoster } from "@/lib/play-platform/actor";
import { playRouteError } from "@/lib/play-platform/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ boardId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { boardId } = await params;
    const students = await loadOmokRoster(boardId);
    return NextResponse.json(
      { students },
      { headers: { "cache-control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return playRouteError(error);
  }
}
