import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  googleClient,
  kakaoClient,
  popStateCookie,
  fetchGoogleUserInfo,
  fetchKakaoUserInfo,
  upsertParentFromOAuth,
  type ProviderId,
} from "@/lib/parent-oauth";
import { createParentSession } from "@/lib/parent-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/parent/auth/callback/{provider}
//   1) state cookie ↔ query.state 검증 (CSRF)
//   2) code → access_token (Google: + PKCE codeVerifier)
//   3) provider user info fetch
//   4) upsertParentFromOAuth → parentId
//   5) createParentSession (cookie set)
//   6) 302 — 활성 자녀 link 있으면 /parent/home, 없으면 onboard/match/code
function errRedirect(req: Request, code: string) {
  const url = new URL(`/parent/auth?error=${code}`, req.url);
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
  if (oauthError) {
    return errRedirect(req, `provider_${oauthError}`);
  }
  if (!code || !incomingState) {
    return errRedirect(req, "missing_params");
  }

  const stateRecord = await popStateCookie();
  if (!stateRecord || stateRecord.state !== incomingState) {
    return errRedirect(req, "invalid_state");
  }

  // 토큰 교환
  let accessToken: string;
  try {
    if (providerId === "google") {
      const client = googleClient();
      if (!client) return errRedirect(req, "provider_disabled");
      if (!stateRecord.codeVerifier) {
        return errRedirect(req, "missing_pkce");
      }
      const tokens = await client.validateAuthorizationCode(
        code,
        stateRecord.codeVerifier
      );
      accessToken = tokens.accessToken();
    } else {
      const client = kakaoClient();
      if (!client) return errRedirect(req, "provider_disabled");
      const tokens = await client.validateAuthorizationCode(code);
      accessToken = tokens.accessToken();
    }
  } catch (e) {
    console.error(`[parent-oauth ${providerId}] token exchange failed`, e);
    return errRedirect(req, "token_exchange_failed");
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
    return errRedirect(req, "userinfo_failed");
  }

  // Parent + ParentOAuthAccount upsert
  let result;
  try {
    result = await upsertParentFromOAuth(providerId, info);
  } catch (e) {
    console.error(`[parent-oauth ${providerId}] upsert failed`, e);
    return errRedirect(req, "upsert_failed");
  }

  // ParentSession 발급
  await createParentSession({
    parentId: result.parentId,
    userAgent: req.headers.get("user-agent") ?? null,
    ipHash: null,
  });

  // redirect 분기 — 활성 자녀 link 있으면 home, 없으면 onboard
  const links = await db.parentChildLink.findMany({
    where: {
      parentId: result.parentId,
      status: "active",
      deletedAt: null,
    },
    select: { id: true },
    take: 1,
  });
  const dest = links.length > 0 ? "/parent/home" : "/parent/onboard/match/code";
  return NextResponse.redirect(new URL(dest, req.url));
}
