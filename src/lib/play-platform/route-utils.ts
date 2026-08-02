import "server-only";

import { NextResponse } from "next/server";
import { PlayAccessError } from "./actor";
import { PlayEngineUnavailableError } from "./server-client";

export function playRouteError(error: unknown): Response {
  if (error instanceof PlayAccessError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  if (error instanceof PlayEngineUnavailableError) {
    return NextResponse.json(
      { error: "play_engine_unavailable" },
      { status: 503 },
    );
  }
  console.error("[play platform] route failed", error);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
