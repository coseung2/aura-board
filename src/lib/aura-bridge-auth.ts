/**
 * Auth resolver for /api/external/* endpoints called by the Aura companion
 * (teacher web app). Two paths during the OAuth migration window:
 *
 *   1) Teacher OAuth (Aura companion) — Bearer access token (auratea_*).
 *      Resolves to a User; downstream endpoints scope by ownership and may
 *      additionally filter by classroomCode.
 *   2) Legacy shared-secret bridge — Bearer = AURA_BRIDGE_TOKEN.
 *      Backward-compatible. classroomCode required (no implicit ownership).
 *      Response gets Deprecation/Sunset headers so the caller knows to switch.
 *
 * Sunset 일자는 OAuth 양쪽 prod 배포 + 2주 후로 박는다 (env 로 조정 가능).
 *
 * 별도 src/lib/external-auth.ts 는 student/Canva JWT 용 (UI 인증 경로). 이건
 * server-to-server bridge 전용이라 파일을 분리.
 */
import "server-only";
import { verifyTeacherAccessToken } from "./oauth-teacher";

export type AuraBridgeAuth =
  | { mode: "oauth"; teacherId: string; scope: string; clientId: string }
  | { mode: "bridge" }
  | { mode: "denied"; reason: "missing_bearer" | "invalid_token" | "no_bridge_configured" };

export async function resolveAuraBridgeAuth(req: Request): Promise<AuraBridgeAuth> {
  const auth =
    req.headers.get("authorization") ??
    req.headers.get("x-aura-board-authorization");
  if (!auth?.startsWith("Bearer ")) {
    return { mode: "denied", reason: "missing_bearer" };
  }
  const token = auth.slice(7).trim();

  // 1) Teacher OAuth access token (recognizable prefix).
  if (token.startsWith("auratea_")) {
    const v = await verifyTeacherAccessToken(token);
    if (!v.ok) return { mode: "denied", reason: "invalid_token" };
    return { mode: "oauth", teacherId: v.userId, scope: v.scope, clientId: v.clientId };
  }

  // 2) Legacy bridge token.
  const bridge = process.env.AURA_BRIDGE_TOKEN;
  if (!bridge) return { mode: "denied", reason: "no_bridge_configured" };
  if (token === bridge) return { mode: "bridge" };
  return { mode: "denied", reason: "invalid_token" };
}

/** 표준 401 응답 + WWW-Authenticate. */
export function deniedResponse(reason: string) {
  return new Response(
    JSON.stringify({ error: "unauthorized", reason }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer realm="aura-board", error="invalid_token", error_description="${reason}"`,
      },
    }
  );
}

/** Sunset 일자 — env 미설정 시 배포일 + 90일 fallback. */
function sunsetDate(): string {
  const env = process.env.AURA_BRIDGE_SUNSET;
  if (env) return env;
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d.toUTCString();
}

/** Bridge 모드 응답 헤더에 deprecation 신호 첨부 (RFC 8594 + Deprecation header). */
export function bridgeDeprecationHeaders(): Record<string, string> {
  return {
    Deprecation: "true",
    Sunset: sunsetDate(),
    Link: '</oauth/authorize>; rel="successor-version"',
  };
}
