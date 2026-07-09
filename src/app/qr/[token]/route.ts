/**
 * GET /qr/[token]
 *
 * 학생이 출력된 QR 코드를 스캔했을 때의 랜딩. Next.js 15 이후
 * Server Component 에서는 `cookies().set()` 호출이 금지돼서 이전의
 * `page.tsx` 구현이 500 을 뱉었다. 이제는 Route Handler 로 전환해
 * 쿠키 설정 → 302 redirect 만 수행한다.
 *
 * 유효 토큰:  createStudentSession → 302 /student
 * 무효 토큰:  302 /qr/invalid (안내 페이지)
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createStudentSession } from "@/lib/student-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_NEXT = "/student";
const FORBIDDEN_NEXT_PREFIXES = ["/api", "/landing", "/login", "/student/login"];
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

// Accept only same-origin internal paths; reject empty, external, and any
// auth-surface targets so the QR flow cannot bounce a fresh student session
// into the login page or a callback chain.
function resolveSafeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw === "/") return null;
  if (
    FORBIDDEN_NEXT_PREFIXES.some(
      (p) => raw === p || raw.startsWith(`${p}/`) || raw.startsWith(`${p}?`),
    )
  ) {
    return null;
  }
  return raw;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const requestUrl = new URL(_req.url);
  const next = resolveSafeNext(requestUrl.searchParams.get("next"));

  const student = await db.student.findUnique({
    where: { qrToken: token },
    select: { id: true, classroomId: true },
  });

  if (!student) {
    const response = NextResponse.redirect(
      new URL("/qr/invalid", _req.url),
      { status: 302 }
    );
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }

  await createStudentSession(student.id, student.classroomId);
  const response = NextResponse.redirect(new URL(next ?? DEFAULT_NEXT, _req.url), {
    status: 302,
  });
  const cookieStore = await cookies();
  const authCookieNames = new Set(AUTHJS_COOKIE_PREFIXES);
  for (const cookie of cookieStore.getAll()) {
    if (isAuthJsCookie(cookie.name)) authCookieNames.add(cookie.name);
  }
  for (const name of authCookieNames) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      secure: authCookieNeedsSecureDelete(name),
      sameSite: "lax",
    });
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie");
  return response;
}
