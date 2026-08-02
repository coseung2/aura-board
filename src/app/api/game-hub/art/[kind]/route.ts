import type { StaticImageData } from "next/image";
import { NextResponse } from "next/server";
import type { OfficialGameKind } from "@/lib/game-platform/contracts";
import { isOfficialPlayLayout } from "@/lib/game-platform/catalog";
import kordleArtwork from "../../../../../../.ai-bridge/generated-game-hub-assets/kordle.png";
import omokArtwork from "../../../../../../.ai-bridge/generated-game-hub-assets/omok.png";
import shadowAllianceArtwork from "../../../../../../.ai-bridge/generated-game-hub-assets/shadow-alliance.png";
import songGuessArtwork from "../../../../../../.ai-bridge/generated-game-hub-assets/song-guess.png";
import speedGameArtwork from "../../../../../../.ai-bridge/generated-game-hub-assets/speed-game.png";

const ARTWORK: Record<OfficialGameKind, StaticImageData> = {
  kordle: kordleArtwork,
  "speed-game": speedGameArtwork,
  "shadow-alliance": shadowAllianceArtwork,
  omok: omokArtwork,
  "song-guess": songGuessArtwork,
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  if (!isOfficialPlayLayout(kind)) {
    return NextResponse.json({ error: "artwork_not_found" }, { status: 404 });
  }

  const target = new URL(ARTWORK[kind].src, request.url);
  return NextResponse.redirect(target, {
    status: 307,
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
    },
  });
}
