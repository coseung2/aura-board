// POST /api/admin/rotate-tokens — 보안 사고 대응용 토큰 회전 엔드포인트.
//
// 사용 시나리오:
//   - 학생 QR·텍스트 코드가 유출됐을 때 특정 학급의 모든 학생 세션 무효화
//   - OAuth refresh token이 탈취됐을 때 전체 revoke
//   - 교사 Canva Connect token 회전 필요
//
// 인증: ADMIN_API_SECRET bearer 필수. Slack 알림 자동 발송.
//
// Body (JSON):
//   { scope: "classroom-student-sessions", classroomId: string }
//     → Student.sessionVersion += 1 (모든 해당 학급 학생 재로그인 필요)
//   { scope: "oauth-refresh-all" }
//     → 모든 OAuthRefreshToken.revokedAt = now
//   { scope: "oauth-refresh-student", studentId: string }
//     → 해당 학생의 모든 refresh token revoke
//   { scope: "canva-connect", userId: string }
//     → CanvaConnectAccount.{accessToken,refreshToken,expiresAt} = null

import { z } from "zod";
import { db } from "@/lib/db";
import { notifySlack } from "@/lib/ops/slack";
import { logAudit } from "@/lib/audit";
import { invalidateStudentIdentityCache } from "@/lib/student-auth";

const Schema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("classroom-student-sessions"),
    classroomId: z.string().min(1),
  }),
  z.object({
    scope: z.literal("oauth-refresh-all"),
  }),
  z.object({
    scope: z.literal("oauth-refresh-student"),
    studentId: z.string().min(1),
  }),
  z.object({
    scope: z.literal("canva-connect"),
    userId: z.string().min(1),
  }),
]);

function authorized(req: Request): boolean {
  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "bad_request", detail: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  const input = parsed.data;

  let affected = 0;
  let summary = "";

  switch (input.scope) {
    case "classroom-student-sessions": {
      const result = await db.student.updateMany({
        where: { classroomId: input.classroomId },
        data: { sessionVersion: { increment: 1 } },
      });
      affected = result.count;
      invalidateStudentIdentityCache();
      summary = `${input.classroomId} 학급 학생 ${affected}명 세션 무효화`;
      break;
    }
    case "oauth-refresh-all": {
      const result = await db.oAuthRefreshToken.updateMany({
        where: { revokedAt: null },
        data: { revokedAt: new Date() },
      });
      affected = result.count;
      summary = `전체 OAuth refresh token ${affected}개 revoke`;
      break;
    }
    case "oauth-refresh-student": {
      const result = await db.oAuthRefreshToken.updateMany({
        where: { studentId: input.studentId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      affected = result.count;
      summary = `학생 ${input.studentId} refresh token ${affected}개 revoke`;
      break;
    }
    case "canva-connect": {
      await db.canvaConnectAccount.updateMany({
        where: { userId: input.userId },
        data: {
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
        },
      });
      affected = 1;
      summary = `교사 ${input.userId} Canva 연결 해제 — 재인증 필요`;
      break;
    }
  }

  // 감사·보안 알림.
  await notifySlack({
    severity: "warn",
    title: "admin: token rotation executed",
    detail: summary,
    context: { scope: input.scope, affected, input: input as unknown as Record<string, unknown> },
  });
  await logAudit({
    actorType: "admin",
    actorId: null, // ADMIN_API_SECRET 만으로 호출 — 개별 admin 식별 불가
    action: `admin.rotate_tokens.${input.scope}`,
    resourceType:
      input.scope === "classroom-student-sessions"
        ? "classroom"
        : input.scope === "oauth-refresh-student"
          ? "student"
          : input.scope === "canva-connect"
            ? "teacher"
            : undefined,
    resourceId:
      input.scope === "classroom-student-sessions"
        ? input.classroomId
        : input.scope === "oauth-refresh-student"
          ? input.studentId
          : input.scope === "canva-connect"
            ? input.userId
            : undefined,
    metadata: { affected, summary },
    req,
  });

  return new Response(
    JSON.stringify({ ok: true, scope: input.scope, affected, summary }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
