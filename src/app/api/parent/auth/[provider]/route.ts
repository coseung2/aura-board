import { NextResponse } from "next/server";
import { generateState, generateCodeVerifier } from "arctic";
import {
  googleClient,
  kakaoClient,
  isProviderEnabled,
  setStateCookie,
  type ProviderId,
} from "@/lib/parent-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MOBILE_DEEP_LINK = "auraboard://parent/auth/callback";

function mobileErrorRedirect(error: string) {
  const url = new URL(MOBILE_DEEP_LINK);
  url.hash = `error=${encodeURIComponent(error)}`;
  return NextResponse.redirect(url);
}

function providerDisabledRedirect(req: Request) {
  const client = new URL(req.url).searchParams.get("client");
  if (client === "mobile") return mobileErrorRedirect("provider_disabled");
  return NextResponse.redirect(
    new URL("/parent/onboard/signup?error=provider_disabled", req.url),
  );
}

// GET /api/parent/auth/{provider} — OAuth 시작
//   1) state + (Google) PKCE codeVerifier 발급
//   2) state cookie set (HMAC signed, 10분 TTL)
//   3) 302 → provider authorization endpoint
//
// arctic 의 createAuthorizationURL 가 scope 와 redirect_uri 자동 채움.
//   Google scope: openid email profile (default sufficient)
//   Kakao scope: account_email profile_nickname profile_image
export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "kakao") {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }
  const providerId = provider as ProviderId;
  if (!isProviderEnabled(providerId)) {
    return providerDisabledRedirect(req);
  }

  const isMobile = new URL(req.url).searchParams.get("client") === "mobile";

  const state = generateState();
  let url: URL;
  let codeVerifier: string | undefined;

  if (providerId === "google") {
    const client = googleClient()!;
    codeVerifier = generateCodeVerifier();
    url = client.createAuthorizationURL(state, codeVerifier, [
      "openid",
      "email",
      "profile",
    ]);
  } else {
    const client = kakaoClient()!;
    url = client.createAuthorizationURL(state, [
      "account_email",
      "profile_nickname",
      "profile_image",
    ]);
  }

  await setStateCookie({ state, codeVerifier, ...(isMobile ? { client: "mobile" } : {}) });
  return NextResponse.redirect(url);
}
