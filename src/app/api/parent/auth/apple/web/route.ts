import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signStatePayload } from "@/lib/parent-oauth-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APP_ORIGIN = "https://aura-board.com";
const CALLBACK_URL = `${APP_ORIGIN}/api/parent/auth/apple/web/callback`;
const STATE_TTL_MS = 10 * 60 * 1000;
export const APPLE_PARENT_WEB_STATE_COOKIE = "parent_apple_web_state";

export function getWebAppleConfig() {
  const clientId = process.env.AUTH_APPLE_ID?.trim();
  const clientSecret = process.env.AUTH_APPLE_SECRET?.trim();
  const stateSecret =
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!clientId || !clientSecret || !stateSecret) return null;
  return { clientId, clientSecret, stateSecret };
}

/** Start a parent-role Sign in with Apple web authorization request. */
export async function GET() {
  const config = getWebAppleConfig();
  if (!config) {
    return NextResponse.redirect(
      new URL("/login?role=parent&error=provider_disabled", APP_ORIGIN),
    );
  }

  const state = signStatePayload(
    {
      state: randomBytes(32).toString("base64url"),
      exp: Date.now() + STATE_TTL_MS,
    },
    config.stateSecret,
  );
  const cookieStore = await cookies();
  cookieStore.set(APPLE_PARENT_WEB_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/api/parent/auth/apple/web",
    maxAge: STATE_TTL_MS / 1000,
  });
  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", CALLBACK_URL);
  url.searchParams.set("scope", "name email");
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}

export { CALLBACK_URL as APPLE_PARENT_WEB_CALLBACK_URL };
