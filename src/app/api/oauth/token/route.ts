/**
 * POST /api/oauth/token — RFC 6749 Token Endpoint.
 *
 * Canva calls this server-to-server to exchange an authorization code for an
 * access+refresh token pair (grant_type=authorization_code) or to rotate a
 * refresh token (grant_type=refresh_token). Client authentication accepts
 * both HTTP Basic and POST-body credentials per the Canva developer portal
 * "Credential transfer mode" options.
 */
import { NextResponse } from "next/server";
import {
  authenticateClient,
  consumeAuthCode,
  issueTokenPairFor,
  rotateRefreshToken,
} from "@/lib/oauth-server";
import {
  consumeTeacherAuthCode,
  issueTeacherTokenPair,
  rotateTeacherRefresh,
} from "@/lib/oauth-teacher";
import { pkceRequiredForClient, subjectKindForClient } from "@/lib/oauth-subject";

export const runtime = "nodejs";
export const maxDuration = 15;

function errorResponse(code: string, description?: string, status = 400) {
  return NextResponse.json(
    { error: code, ...(description ? { error_description: description } : {}) },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    }
  );
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return errorResponse(
      "invalid_request",
      "Content-Type must be application/x-www-form-urlencoded"
    );
  }

  const form = await req.formData();
  const grantType = String(form.get("grant_type") ?? "");

  const clientAuth = await authenticateClient({
    basicAuthHeader: req.headers.get("authorization"),
    bodyClientId: (form.get("client_id") as string) ?? null,
    bodyClientSecret: (form.get("client_secret") as string) ?? null,
  });
  if (!clientAuth.ok) return errorResponse("invalid_client", undefined, 401);
  const client = clientAuth.client;
  const subject = subjectKindForClient(client.id);

  if (grantType === "authorization_code") {
    const code = String(form.get("code") ?? "");
    const redirectUri = String(form.get("redirect_uri") ?? "");
    const codeVerifier = String(form.get("code_verifier") ?? "");
    if (!code || !redirectUri) {
      return errorResponse("invalid_request", "code and redirect_uri required");
    }
    if (pkceRequiredForClient(client.id, client.pkceRequired) && !codeVerifier) {
      return errorResponse("invalid_request", "code_verifier required");
    }

    if (subject === "user") {
      const result = await consumeTeacherAuthCode({
        code,
        clientId: client.id,
        redirectUri,
        codeVerifier,
      });
      if (!result.ok) return errorResponse(result.error);
      const pair = await issueTeacherTokenPair({
        userId: result.userId,
        clientId: client.id,
        scope: result.scope,
      });
      return NextResponse.json(
        {
          access_token: pair.accessToken,
          token_type: pair.tokenType,
          expires_in: pair.expiresIn,
          refresh_token: pair.refreshToken,
          scope: pair.scope,
        },
        { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } }
      );
    }

    const result = await consumeAuthCode({
      code,
      clientId: client.id,
      redirectUri,
      codeVerifier,
    });
    if (!result.ok) return errorResponse(result.error);

    const pair = await issueTokenPairFor({
      studentId: result.studentId,
      clientId: client.id,
      scope: result.scope,
    });

    return NextResponse.json(
      {
        access_token: pair.accessToken,
        token_type: pair.tokenType,
        expires_in: pair.expiresIn,
        refresh_token: pair.refreshToken,
        scope: pair.scope,
      },
      {
        headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
      }
    );
  }

  if (grantType === "refresh_token") {
    const refresh = String(form.get("refresh_token") ?? "");
    if (!refresh) return errorResponse("invalid_request", "refresh_token required");

    if (subject === "user") {
      const result = await rotateTeacherRefresh({
        refreshPlaintext: refresh,
        clientId: client.id,
      });
      if (!result.ok) return errorResponse(result.error);
      return NextResponse.json(
        {
          access_token: result.pair.accessToken,
          token_type: result.pair.tokenType,
          expires_in: result.pair.expiresIn,
          refresh_token: result.pair.refreshToken,
          scope: result.pair.scope,
        },
        { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } }
      );
    }

    const result = await rotateRefreshToken({
      refreshPlaintext: refresh,
      clientId: client.id,
    });
    if (!result.ok) return errorResponse(result.error);

    return NextResponse.json(
      {
        access_token: result.pair.accessToken,
        token_type: result.pair.tokenType,
        expires_in: result.pair.expiresIn,
        refresh_token: result.pair.refreshToken,
        scope: result.pair.scope,
      },
      {
        headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
      }
    );
  }

  return errorResponse("unsupported_grant_type");
}
