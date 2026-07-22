import { NextResponse } from "next/server";
import {
  googleClient,
  exchangeGoogleAuthorizationCode,
  kakaoClient,
  popStateCookie,
  fetchGoogleUserInfo,
  fetchKakaoUserInfo,
  upsertParentFromOAuth,
  type ProviderId,
} from "@/lib/parent-oauth";
import { createParentSession } from "@/lib/parent-session";
import { auth, signOut } from "@/lib/auth-config";
import { isSameAccountPrincipal } from "@/lib/account-principal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/parent/auth/callback/{provider}
//   1) state cookie ↔ query.state 검증 (CSRF)
//   2) code → access_token (Google: + PKCE codeVerifier)
//   3) provider user info fetch
//   4) upsertParentFromOAuth → parentId
//   5) createParentSession (cookie set)
//   6) 302 — 활성/대기 link 있으면 /parent/feed, 없으면 onboard/match/code
const MOBILE_DEEP_LINK = "auraboard://parent/auth/callback";

function mobileRedirect(
  params: { token?: string; expiresAt?: string; error?: string },
  callbackUrl = MOBILE_DEEP_LINK,
) {
  const url = new URL(callbackUrl);
  // Expo Go strips both fragments and query params while resolving a project
  // deep link. Its file-route path is preserved, so the trusted emulator-only
  // callback carries the handoff as a route segment. Installed builds retain
  // fragment-based handoff and never expose the token in an HTTP request path.
  const expoGo = url.protocol === "exp:";
  if (params.error) {
    if (expoGo) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/error/${encodeURIComponent(params.error)}`;
    }
    else url.hash = `error=${encodeURIComponent(params.error)}`;
  } else if (params.token && params.expiresAt) {
    if (expoGo) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/token/${encodeURIComponent(params.token)}`;
    } else {
      url.hash = `token=${encodeURIComponent(params.token)}&expiresAt=${encodeURIComponent(
        params.expiresAt,
      )}`;
    }
  }
  return NextResponse.redirect(url);
}

function errRedirect(
  req: Request,
  code: string,
  isMobile = false,
  callbackUrl = MOBILE_DEEP_LINK,
) {
  if (isMobile) return mobileRedirect({ error: code }, callbackUrl);
  // 학부모 OAuth 에러는 진입점(/parent/onboard/signup) 으로 되돌림.
  // /parent/auth 는 page.tsx 가 없는 디렉토리(callback route handler 만 존재).
  const url = new URL("/login", req.url);
  url.searchParams.set("role", "parent");
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

function restartAuth(req: Request, provider: ProviderId) {
  const url = new URL(`/api/parent/auth/${provider}`, req.url);
  return NextResponse.redirect(url);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "kakao") {
    return errRedirect(req, "invalid_provider");
  }
  const providerId = provider as ProviderId;

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const incomingState = searchParams.get("state");
  const oauthError = searchParams.get("error");
  // Pop even when the provider omits state so a mobile attempt can return an
  // in-app error instead of silently falling back to the web login flow.
  const stateRecord = await popStateCookie();
  const isMobile = stateRecord?.client === "mobile";
  const callbackUrl = stateRecord?.redirect ?? MOBILE_DEEP_LINK;

  if (oauthError) {
    return errRedirect(req, `provider_${oauthError}`, isMobile, callbackUrl);
  }
  if (!code || !incomingState) {
    if (isMobile) return errRedirect(req, "missing_params", true, callbackUrl);
    return restartAuth(req, providerId);
  }
  if (!stateRecord || stateRecord.state !== incomingState) {
    if (isMobile) return errRedirect(req, "invalid_state", true, callbackUrl);
    return restartAuth(req, providerId);
  }

  // 토큰 교환
  let accessToken: string;
  try {
    if (providerId === "google") {
      const client = googleClient();
      if (!client) return errRedirect(req, "provider_disabled", isMobile, callbackUrl);
      if (!stateRecord.codeVerifier) {
        if (isMobile) return errRedirect(req, "missing_pkce", true, callbackUrl);
        return restartAuth(req, providerId);
      }
      accessToken = await exchangeGoogleAuthorizationCode(
        code,
        stateRecord.codeVerifier,
      );
    } else {
      const client = kakaoClient();
      if (!client)
        return errRedirect(
          req,
          "provider_disabled",
          isMobile,
          callbackUrl,
        );
      const tokens = await client.validateAuthorizationCode(code);
      accessToken = tokens.accessToken();
    }
  } catch (e) {
    console.error(`[parent-oauth ${providerId}] token exchange failed`, e);
    return errRedirect(req, "token_exchange_failed", isMobile, callbackUrl);
  }

  // user info 조회
  let info;
  try {
    info =
      providerId === "google"
        ? await fetchGoogleUserInfo(accessToken)
        : await fetchKakaoUserInfo(accessToken);
  } catch (e) {
    console.error(`[parent-oauth ${providerId}] userinfo failed`, e);
    return errRedirect(req, "userinfo_failed", isMobile, callbackUrl);
  }

  // Parent + ParentOAuthAccount upsert
  let result;
  try {
    result = await upsertParentFromOAuth(providerId, info);
  } catch (e) {
    console.error(`[parent-oauth ${providerId}] upsert failed`, e);
    return errRedirect(req, "upsert_failed", isMobile, callbackUrl);
  }

  // ParentSession 발급
  // A different account's parent login replaces the teacher session. Matching
  // emails keep both role sessions so one person can switch roles freely.
  const teacherSession = await auth().catch(() => null);
  if (
    teacherSession?.user &&
    !isSameAccountPrincipal(teacherSession.user.email, info.email)
  ) {
    await signOut({ redirect: false }).catch(() => undefined);
  }

  const parentSession = await createParentSession({
    parentId: result.parentId,
    userAgent: req.headers.get("user-agent") ?? null,
    ipHash: null,
  });

  if (isMobile) {
    return mobileRedirect(
      {
        token: parentSession.token,
        expiresAt: parentSession.expiresAt.toISOString(),
      },
      callbackUrl,
    );
  }

  // redirect 분기 — 활성/대기 자녀 link 있으면 dashboard, 없으면 onboard
  return NextResponse.redirect(new URL("/parent/home", req.url));
}
