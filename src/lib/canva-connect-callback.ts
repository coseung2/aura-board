import "server-only";

import { NextResponse } from "next/server";
import {
  decodeCanvaAuthState,
  exchangeCode,
} from "./canva";
import { getCurrentUser } from "./auth";

// Next.js standalone builds req.url from the server's bind address
// (localhost:3000) instead of the public Host header, so redirects must use
// the configured public origin.
const APP_ORIGIN =
  process.env.AURA_BOARD_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_BASE_URL ??
  "https://aura-board.com";

function safeReturnTo(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value === "/" || value === "/landing") return fallback;
  return value;
}

export async function handleCanvaConnectCallback(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    const canvaState = state ? decodeCanvaAuthState(state) : null;
    const returnTo = safeReturnTo(canvaState?.returnTo);
    const url = new URL(returnTo, APP_ORIGIN);
    url.searchParams.set("canva", oauthError);
    return NextResponse.redirect(url);
  }

  if (!code || !state) {
    const url = new URL("/dashboard", APP_ORIGIN);
    url.searchParams.set("canva", "missing_oauth_params");
    return NextResponse.redirect(url);
  }

  const canvaState = decodeCanvaAuthState(state);
  if (!canvaState) {
    return NextResponse.json({ error: "Invalid or expired OAuth state" }, { status: 400 });
  }
  const teacher = await getCurrentUser().catch(() => null);
  if (!teacher || teacher.id !== canvaState.id) {
    return NextResponse.json({ error: "OAuth session mismatch" }, { status: 403 });
  }
  const success = await exchangeCode(canvaState.id, code);
  if (!success) {
    return NextResponse.json({ error: "Token exchange failed" }, { status: 500 });
  }

  const returnTo = safeReturnTo(canvaState.returnTo);
  return NextResponse.redirect(new URL(returnTo, APP_ORIGIN));
}
