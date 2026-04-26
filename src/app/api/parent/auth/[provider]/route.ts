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

// GET /api/parent/auth/{provider} — OAuth 시작
//   1) state + (Google) PKCE codeVerifier 발급
//   2) state cookie set (HMAC signed, 10분 TTL)
//   3) 302 → provider authorization endpoint
//
// arctic 의 createAuthorizationURL 가 scope 와 redirect_uri 자동 채움.
//   Google scope: openid email profile (default sufficient)
//   Kakao scope: account_email profile_nickname profile_image
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "kakao") {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }
  const providerId = provider as ProviderId;
  if (!isProviderEnabled(providerId)) {
    return NextResponse.redirect(
      new URL("/parent/auth?error=provider_disabled", _req.url)
    );
  }

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

  await setStateCookie({ state, codeVerifier });
  return NextResponse.redirect(url);
}
