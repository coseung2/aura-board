import { NextResponse } from "next/server";
import { isOfficialPlayLayout } from "@/lib/game-platform/catalog";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  if (!isOfficialPlayLayout(kind)) {
    return NextResponse.json({ error: "artwork_not_found" }, { status: 404 });
  }

  return NextResponse.redirect(new URL(`/game-hub/${kind}.png`, request.url), {
    status: 308,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
    },
  });
}
