import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { Google, Kakao } from "arctic";
import { db } from "./db";
import {
  signStatePayload,
  verifyStateToken,
  type StatePayload,
} from "./parent-oauth-state";

// parent-redesign (2026-04-26): 학부모 OAuth — Google + Kakao.
// arctic 라이브러리로 표준 OAuth 2.0 Authorization Code + PKCE 흐름.
// state cookie 는 HMAC-signed (CSRF 방지). 콜백 시 code → token → user info
// → Parent upsert + ParentOAuthAccount link → ParentSession 발급.

const SECRET = process.env.AUTH_SECRET ?? "dev-secret";
const STATE_COOKIE = "parent_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000; // 10분
const CANONICAL_APP_ORIGIN = "https://aura-board.com";
const VERCEL_APP_ORIGIN_ALIAS = "https://aura-board-app.vercel.app";

export type ProviderId = "google" | "kakao";

export function normalizeParentOAuthBaseUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.origin === VERCEL_APP_ORIGIN_ALIAS) {
      return CANONICAL_APP_ORIGIN;
    }
  } catch {
    // Keep the existing value so a malformed local override still surfaces
    // through the provider request instead of silently changing its target.
  }
  return value.replace(/\/$/, "");
}

function appBaseUrl(): string {
  const configured =
    process.env.PARENT_OAUTH_REDIRECT_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  return normalizeParentOAuthBaseUrl(configured);
}

export function getCallbackUrl(provider: ProviderId): string {
  return `${appBaseUrl()}/api/parent/auth/callback/${provider}`;
}

function googleCredentials(): { id: string; secret: string } | null {
  const parentId = process.env.GOOGLE_PARENT_CLIENT_ID?.trim();
  const parentSecret = process.env.GOOGLE_PARENT_CLIENT_SECRET?.trim();
  const sharedId = process.env.AUTH_GOOGLE_ID?.trim();
  const sharedSecret = process.env.AUTH_GOOGLE_SECRET?.trim();

  // Local development uses the already-established web OAuth client. Its
  // authorized redirects include localhost and the parent callback. Keep the
  // dedicated parent client as the production preference.
  if (process.env.NODE_ENV !== "production" && sharedId && sharedSecret) {
    return { id: sharedId, secret: sharedSecret };
  }
  if (parentId && parentSecret) return { id: parentId, secret: parentSecret };
  if (sharedId && sharedSecret) return { id: sharedId, secret: sharedSecret };
  return null;
}

export function googleClient(): Google | null {
  const credentials = googleCredentials();
  if (!credentials) return null;
  return new Google(
    credentials.id,
    credentials.secret,
    getCallbackUrl("google"),
  );
}

/**
 * Exchange Google's authorization code using an explicit string body.
 * In the Next.js development runtime, Arctic's Request body can be consumed
 * by the patched fetch implementation before Undici sends it, producing
 * `expected non-null body source`. A plain form-encoded string avoids that
 * runtime incompatibility while preserving the same OAuth + PKCE flow.
 */
export async function exchangeGoogleAuthorizationCode(
  code: string,
  codeVerifier: string,
): Promise<string> {
  const client = googleClient();
  if (!client) throw new Error("google_provider_disabled");

  // Production previously used Arctic's confidential-client exchange, which
  // authenticates with HTTP Basic. Keep that proven path in production. The
  // plain string body remains only for local Next.js development, where the
  // patched fetch runtime can consume Arctic's Request body before Undici
  // sends it.
  if (process.env.NODE_ENV === "production") {
    const tokens = await client.validateAuthorizationCode(code, codeVerifier);
    return tokens.accessToken();
  }

  const credentials = googleCredentials();
  if (!credentials) throw new Error("google_provider_disabled");

  const body = new URLSearchParams({
    client_id: credentials.id,
    client_secret: credentials.secret,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: getCallbackUrl("google"),
  }).toString();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
  } | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(`google_token_exchange_${payload?.error ?? response.status}`);
  }
  return payload.access_token;
}

export function kakaoClient(): Kakao | null {
  const id = process.env.KAKAO_PARENT_CLIENT_ID;
  const secret = process.env.KAKAO_PARENT_CLIENT_SECRET;
  if (!id || !secret) return null;
  return new Kakao(id, secret, getCallbackUrl("kakao"));
}

export function isProviderEnabled(provider: ProviderId): boolean {
  return provider === "google"
    ? !!googleClient()
    : !!kakaoClient();
}

// ─── State cookie (HMAC signed JSON via parent-oauth-state) ───────────────

export async function setStateCookie(payload: Omit<StatePayload, "exp">) {
  const cookieStore = await cookies();
  cookieStore.set(
    STATE_COOKIE,
    signStatePayload(
      { ...payload, exp: Date.now() + STATE_TTL_MS },
      SECRET
    ),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: STATE_TTL_MS / 1000,
    }
  );
}

export async function popStateCookie(): Promise<StatePayload | null> {
  const cookieStore = await cookies();
  const v = cookieStore.get(STATE_COOKIE)?.value;
  if (!v) return null;
  cookieStore.delete(STATE_COOKIE);
  return verifyStateToken(v, SECRET);
}

export function makeState(): string {
  return randomBytes(16).toString("base64url");
}

// ─── User info shape ──────────────────────────────────────────────────────

export type OAuthUserInfo = {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  profileImage: string | null;
};

export async function fetchGoogleUserInfo(
  accessToken: string
): Promise<OAuthUserInfo> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`google_userinfo_failed_${res.status}`);
  const data = (await res.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  return {
    providerAccountId: data.sub,
    email: data.email ?? null,
    emailVerified: !!data.email_verified,
    displayName: data.name ?? null,
    profileImage: data.picture ?? null,
  };
}

export async function fetchKakaoUserInfo(
  accessToken: string
): Promise<OAuthUserInfo> {
  const res = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`kakao_userinfo_failed_${res.status}`);
  const data = (await res.json()) as {
    id: number;
    kakao_account?: {
      email?: string;
      is_email_valid?: boolean;
      is_email_verified?: boolean;
      profile?: { nickname?: string; profile_image_url?: string };
    };
  };
  const acct = data.kakao_account ?? {};
  return {
    providerAccountId: String(data.id),
    email: acct.email ?? null,
    emailVerified:
      !!acct.is_email_valid && !!acct.is_email_verified,
    displayName: acct.profile?.nickname ?? null,
    profileImage: acct.profile?.profile_image_url ?? null,
  };
}

// ─── Account linking ──────────────────────────────────────────────────────

/**
 * OAuth user info → Parent (upsert) + ParentOAuthAccount (link).
 *  1) (provider, providerAccountId) 매칭 → 기존 link 그대로 사용
 *  2) verified email 매칭 → 기존 Parent 에 신규 ParentOAuthAccount 추가
 *  3) email 없음/미일치 → 신규 Parent + ParentOAuthAccount 생성
 *
 * email 이 null 또는 unverified 이고 (1) 매칭 없을 때 → 신규 Parent 생성.
 * Parent.email 이 unique 이고 NOT NULL 이므로 fallback email 생성:
 *   "oauth-{provider}-{providerAccountId}@noemail.aura.local"
 * 이 placeholder 는 발송 처리에서 도메인 체크로 skip 가능 (별도 task).
 */
export async function upsertParentFromOAuth(
  provider: ProviderId,
  info: OAuthUserInfo
): Promise<{ parentId: string; isNewParent: boolean }> {
  // (1) 기존 link 매칭
  const existing = await db.parentOAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: info.providerAccountId,
      },
    },
  });
  if (existing) {
    // 메타 갱신 (displayName/profileImage 변경 가능성)
    await db.parentOAuthAccount.update({
      where: { id: existing.id },
      data: {
        email: info.email,
        emailVerified: info.emailVerified,
        displayName: info.displayName,
        profileImage: info.profileImage,
      },
    });
    return { parentId: existing.parentId, isNewParent: false };
  }

  // (2) verified email 매칭 → 기존 Parent 에 link
  if (info.email && info.emailVerified) {
    const matched = await db.parent.findUnique({
      where: { email: info.email },
    });
    if (matched && !matched.parentDeletedAt) {
      await db.parentOAuthAccount.create({
        data: {
          parentId: matched.id,
          provider,
          providerAccountId: info.providerAccountId,
          email: info.email,
          emailVerified: info.emailVerified,
          displayName: info.displayName,
          profileImage: info.profileImage,
        },
      });
      return { parentId: matched.id, isNewParent: false };
    }
  }

  // (3) 신규 Parent + 신규 link
  const emailForRow =
    info.email && info.emailVerified
      ? info.email
      : `oauth-${provider}-${info.providerAccountId}@noemail.aura.local`;
  const newParent = await db.parent.create({
    data: {
      email: emailForRow,
      name: info.displayName ?? "학부모",
    },
  });
  await db.parentOAuthAccount.create({
    data: {
      parentId: newParent.id,
      provider,
      providerAccountId: info.providerAccountId,
      email: info.email,
      emailVerified: info.emailVerified,
      displayName: info.displayName,
      profileImage: info.profileImage,
    },
  });
  return { parentId: newParent.id, isNewParent: true };
}
