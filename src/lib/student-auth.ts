import "server-only";
import { cookies, headers } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";
import { getCurrentUser } from "./auth";

const SECRET = process.env.AUTH_SECRET ?? "dev-secret";
const COOKIE_NAME = "student_session";
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const USE_SECURE_STUDENT_COOKIE = process.env.NODE_ENV === "production";

interface StudentPayload {
  studentId: string;
  classroomId: string;
  sessionVersion: number;
  exp: number;
}

function sign(payload: StudentPayload): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verify(token: string): StudentPayload | null {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(b64).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString()) as StudentPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * 세션 쿠키를 심고 HMAC 토큰 문자열을 반환.
 * 웹은 쿠키만 사용하고 반환값을 무시해도 됨. 모바일은 이 토큰을 저장해
 * 이후 요청에 `Authorization: Bearer <token>` 헤더로 재사용.
 */
export async function createStudentSession(
  studentId: string,
  classroomId: string,
): Promise<string> {
  const student = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  const payload: StudentPayload = {
    studentId,
    classroomId,
    sessionVersion: student.sessionVersion,
    exp: Date.now() + MAX_AGE * 1000,
  };
  const token = sign(payload);
  const cookieStore = await cookies();
  // Production needs SameSite=None + Secure so Canva's cross-site app surface
  // can include this cookie. Local HTTP cannot store Secure cookies, so dev
  // uses Lax to keep QR/text-code login functional.
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: USE_SECURE_STUDENT_COOKIE,
    sameSite: USE_SECURE_STUDENT_COOKIE ? "none" : "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return token;
}

export async function getCurrentStudent() {
  // Teacher session wins: if a NextAuth user is authenticated, ignore any
  // stale student cookie. Same browser commonly carries both (teacher tests
  // a student login) and mis-attribution of actions to the student is the
  // class of bug that motivated this gate.
  const user = await getCurrentUser().catch(() => null);
  if (user) return null;
  return getCurrentStudentRaw();
}

export async function getCurrentStudentRaw() {
  // 1순위: Authorization: Bearer <token> (모바일 앱)
  // 2순위: student_session 쿠키 (웹)
  const headerList = await headers();
  const authHeader = headerList.get("authorization") ?? headerList.get("Authorization");
  let token: string | null = null;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    const cookieStore = await cookies();
    token = cookieStore.get(COOKIE_NAME)?.value ?? null;
  }
  if (!token) return null;

  const payload = verify(token);
  if (!payload) return null;
  const student = await db.student.findUnique({
    where: { id: payload.studentId },
    include: { classroom: true },
  });
  if (!student) return null;
  if (student.sessionVersion !== payload.sessionVersion) return null;
  return student;
}

export async function clearStudentSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
