import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { createStudentSession } from "@/lib/student-auth";
import { limitStudentAuth } from "@/lib/rate-limit-routes";

// student-auth-fail-closed: 텍스트 코드 bruteforce / 학급 단위 로그인
// 스파이크를 동시에 막기 위해 입력 길이에 상한을 두고 트림한다. 기존 정상
// 사용(영숫자 코드 4~8자 + QR 토큰 64자)에는 영향 없음.
const AuthSchema = z.object({
  token: z
    .string()
    .min(1)
    .max(128)
    .transform((s) => s.trim())
    .refine((s) => s.length >= 1 && s.length <= 128, {
      message: "token length must be 1..128",
    }),
});

/** 학급 한정 4~8자 대문자 코드는 입력 그대로, 그 외(QR 토큰 등)는
 *  sha256 hex 16자 해시로 축약해 Upstash 키 카디널리티와 PII 노출을
 *  동시에 줄인다. */
function normalizeTokenKey(raw: string): string {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (/^[A-Z0-9]{2,16}$/.test(compact)) return compact;
  return createHash("sha256").update(compact).digest("hex").slice(0, 16);
}

function clientIpFor(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-vercel-forwarded-for")?.trim() ||
    "0.0.0.0"
  );
}

// Student code login is an explicit identity switch. Clear Auth.js teacher
// cookies too, otherwise getCurrentStudent() will ignore the new student cookie
// and /student will bounce back to /login.
const AUTHJS_COOKIE_PREFIXES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
];

function isAuthJsCookie(name: string) {
  return AUTHJS_COOKIE_PREFIXES.some(
    (prefix) => name === prefix || name.startsWith(`${prefix}.`),
  );
}

function authCookieNeedsSecureDelete(name: string) {
  return name.startsWith("__Secure-") || name.startsWith("__Host-");
}

export async function POST(req: Request) {
  try {
    // student-auth-fail-closed: 학급 단위 코드 로그인 스파이크 / IP
    // bruteforce를 동시에 막기 위해 IP와 정규화된 토큰/코드 축을 함께
    // 검사한다. 학교 NAT를 고려해 IP 축은 넉넉하게, 코드 축은 더 좁게 둔다.
    const body = await req.json();
    const { token } = AuthSchema.parse(body);
    const rl = await limitStudentAuth({
      ipKey: clientIpFor(req),
      tokenKey: normalizeTokenKey(token),
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "rate_limited", axis: rl.axis, retryAfter: rl.retryAfter },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    // Try qrToken first, then textCode
    let student = await db.student.findUnique({ where: { qrToken: token } });
    if (!student) {
      student = await db.student.findUnique({ where: { textCode: token.toUpperCase() } });
    }

    if (!student) {
      return NextResponse.json({ error: "invalid_token" }, { status: 404 });
    }

    // The cookie is for web sessions; mobile stores sessionToken and reuses it
    // with Authorization: Bearer <token>.
    const sessionToken = await createStudentSession(student.id, student.classroomId);

    const cookieStore = await cookies();
    const authCookieNames = new Set(AUTHJS_COOKIE_PREFIXES);
    for (const cookie of cookieStore.getAll()) {
      if (isAuthJsCookie(cookie.name)) authCookieNames.add(cookie.name);
    }

    const response = NextResponse.json({
      success: true,
      redirect: "/student",
      sessionToken,
      student: {
        id: student.id,
        name: student.name,
        classroomId: student.classroomId,
      },
    });
    for (const name of authCookieNames) {
      response.cookies.set(name, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
        secure: authCookieNeedsSecureDelete(name),
        sameSite: "lax",
      });
    }
    return response;
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[POST /api/student/auth]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
