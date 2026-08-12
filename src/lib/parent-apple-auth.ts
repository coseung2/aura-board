import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const APPLE_IDENTITY_ISSUER = "https://appleid.apple.com";
export const APPLE_PARENT_AUDIENCE = "com.auraboard.app";
export const APPLE_IDENTITY_JWKS_URL =
  "https://appleid.apple.com/auth/keys";

export const MAX_APPLE_IDENTITY_TOKEN_LENGTH = 16_384;

let appleJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getAppleJwks() {
  if (appleJwks) return appleJwks;
  appleJwks = createRemoteJWKSet(new URL(APPLE_IDENTITY_JWKS_URL));
  return appleJwks;
}

export class AppleIdentityTokenError extends Error {
  readonly code = "invalid_identity_token";

  constructor() {
    super("invalid_identity_token");
    this.name = "AppleIdentityTokenError";
  }
}

export type VerifiedAppleIdentity = {
  sub: string;
  email: string | null;
  emailVerified: boolean;
};

/**
 * Verify the native Sign in with Apple identity token.
 *
 * The token is the proof of identity for the native flow. Apple authorization
 * codes are accepted by the API contract for future exchange flows, but this
 * verifier deliberately requires no Apple private key.
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  audience = APPLE_PARENT_AUDIENCE,
): Promise<VerifiedAppleIdentity> {
  const token = typeof identityToken === "string" ? identityToken.trim() : "";
  if (!token || token.length > MAX_APPLE_IDENTITY_TOKEN_LENGTH) {
    throw new AppleIdentityTokenError();
  }

  try {
    const { payload } = await jwtVerify(token, getAppleJwks(), {
      algorithms: ["RS256"],
      issuer: APPLE_IDENTITY_ISSUER,
      audience,
    });

    // jwtVerify checks an exp claim when present, but Apple identity tokens
    // must have one for this endpoint. Keep this explicit so a signed token
    // without expiry cannot become a long-lived login proof.
    if (
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new AppleIdentityTokenError();
    }

    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!sub || sub.length > 255) {
      throw new AppleIdentityTokenError();
    }

    // Apple private relay addresses are valid here. The email is trusted only
    // when the signed email_verified claim explicitly says it is verified.
    const emailVerified =
      payload.email_verified === true || payload.email_verified === "true";
    const rawEmail =
      emailVerified && typeof payload.email === "string"
        ? payload.email.trim()
        : "";

    return {
      sub,
      email: rawEmail && rawEmail.length <= 320 ? rawEmail : null,
      emailVerified,
    };
  } catch (error) {
    if (error instanceof AppleIdentityTokenError) throw error;
    // Do not expose jose/JWKS details or any token-derived value to callers.
    throw new AppleIdentityTokenError();
  }
}
