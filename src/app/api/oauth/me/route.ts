// GET /api/oauth/me — 디버그/연동 헬스체크
//
// 교사 OAuth access token (Bearer) 으로 호출하면 그 토큰이 어떤 교사한테
// 묶여 있는지 확인. Aura 가 토큰 발급/갱신 후 정상 식별되는지 확인용.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTeacherAccessToken } from "@/lib/oauth-teacher";

function safeTokenPrefix(token: string): string {
  const match = token.match(/^auratea_([0-9A-Za-z]{8})_/);
  return match?.[1] ?? "unknown";
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    console.warn("[oauth/me] missing bearer");
    return NextResponse.json(
      { error: "missing_bearer" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer realm="aura-board", error="invalid_token"',
        },
      }
    );
  }
  const token = auth.slice(7).trim();
  const result = await verifyTeacherAccessToken(token);
  if (!result.ok) {
    console.warn("[oauth/me] token verification failed", {
      reason: result.code,
      tokenPrefix: safeTokenPrefix(token),
    });
    return NextResponse.json(
      { error: "invalid_token", reason: result.code },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer realm="aura-board", error="invalid_token", error_description="${result.code}"`,
        },
      }
    );
  }
  const user = await db.user.findUnique({
    where: { id: result.userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }
  return NextResponse.json({
    teacherId: user.id,
    email: user.email,
    name: user.name,
    clientId: result.clientId,
    scope: result.scope,
  });
}
