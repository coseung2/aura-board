import "server-only";
import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { Google, Kakao } from "arctic";
import { db } from "./db";

// parent-redesign (2026-04-26): 학부모 OAuth — Google + Kakao.
// arctic 라이브러리로 표준 OAuth 2.0 Authorization Code + PKCE 흐름.
// state cookie 는 HMAC-signed (CSRF 방지). 콜백 시 code → token → user info
// → Parent upsert + ParentOAuthAccount link → ParentSession 발급.

const SECRET = process.env.AUTH_SECRET ?? "dev-secret";
const STATE_COOKIE = "parent_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000; // 10분

export type ProviderId = "google" | "kakao";

function appBaseUrl(): string {
  return (
    process.env.PARENT_OAUTH_REDIRECT_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  );
}

export function getCallbackUrl(provider: ProviderId): string {
  return `${appBaseUrl()}/api/parent/auth/callback/${provider}`;
}

export function googleClient(): Google | null {
  const id = process.env.GOOGLE_PARENT_CLIENT_ID;
  const secret = process.env.GOOGLE_PARENT_CLIENT_SECRET;
  if (!id || !secret) return null;
  return new Google(id, secret, getCallbackUrl("google"));
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

// ─── State cookie (HMAC signed JSON) ──────────────────────────────────────

type StatePayload = {
  state: string; // arctic state token
  codeVerifier?: string; // PKCE
  exp: number;
  redirect?: string; // post-auth destination override (currently unused)
};

function sign(payload: StatePayload): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verify(token: string): StatePayload | null {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(b64, "base64url").toString()
    ) as StatePayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setStateCookie(payload: Omit<StatePayload, "exp">) {
  const cookieStore = await cookies();
  cookieStore.set(
    STATE_COOKIE,
    sign({ ...payload, exp: Date.now() + STATE_TTL_MS }),
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
  return verify(v);
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
