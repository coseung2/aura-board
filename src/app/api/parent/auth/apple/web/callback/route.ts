import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAppleIdentityToken } from "@/lib/parent-apple-auth";
import { upsertParentFromOAuth } from "@/lib/parent-oauth";
import { verifyStateToken } from "@/lib/parent-oauth-state";
import { createParentSession } from "@/lib/parent-session";
import {
  APPLE_PARENT_WEB_CALLBACK_URL,
  APPLE_PARENT_WEB_STATE_COOKIE,
  getWebAppleConfig,
} from "../route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APP_ORIGIN = "https://aura-board.com";

function loginError(code: string) {
  const url = new URL("/login", APP_ORIGIN);
  url.searchParams.set("role", "parent");
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

function parseAppleName(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.length > 4_096) return null;
  try {
    const parsed = JSON.parse(value) as {
      name?: { firstName?: unknown; lastName?: unknown };
    };
    const name = [parsed.name?.firstName, parsed.name?.lastName]
      .filter((part): part is string => typeof part === "string" && !!part.trim())
      .map((part) => part.trim())
      .join(" ");
    return name.slice(0, 200) || null;
  } catch {
    return null;
  }
}

/** Complete Apple's form_post callback and issue the Aura parent session. */
export async function POST(req: Request) {
  const config = getWebAppleConfig();
  if (!config) return loginError("provider_disabled");

  const form = await req.formData().catch(() => null);
  if (!form) return loginError("invalid_request");
  const providerError = form.get("error");
  if (typeof providerError === "string" && providerError) {
    return loginError(`provider_${providerError}`);
  }
  const code = form.get("code");
  const state = form.get("state");
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(APPLE_PARENT_WEB_STATE_COOKIE)?.value;
  cookieStore.delete(APPLE_PARENT_WEB_STATE_COOKIE);
  if (typeof code !== "string" || !code || code.length > 4_096) {
    return loginError("missing_params");
  }
  if (
    typeof state !== "string" ||
    !cookieState ||
    cookieState !== state ||
    !verifyStateToken(state, config.stateSecret)
  ) {
    return loginError("invalid_state");
  }

  const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: APPLE_PARENT_WEB_CALLBACK_URL,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }).toString(),
    cache: "no-store",
  }).catch(() => null);
  const tokens = tokenResponse
    ? ((await tokenResponse.json().catch(() => null)) as { id_token?: unknown } | null)
    : null;
  if (!tokenResponse?.ok || typeof tokens?.id_token !== "string") {
    return loginError("token_exchange_failed");
  }

  try {
    const identity = await verifyAppleIdentityToken(
      tokens.id_token,
      config.clientId,
    );
    const parent = await upsertParentFromOAuth("apple", {
      providerAccountId: identity.sub,
      email: identity.email,
      emailVerified: identity.emailVerified,
      displayName: parseAppleName(form.get("user")),
      profileImage: null,
    });
    await createParentSession({
      parentId: parent.parentId,
      userAgent: req.headers.get("user-agent") ?? null,
      ipHash: null,
    });
    return NextResponse.redirect(new URL("/parent/home", APP_ORIGIN));
  } catch {
    return loginError("upsert_failed");
  }
}
