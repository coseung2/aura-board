import "server-only";
import { cookies, headers } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";
import { getCurrentUser } from "./auth";
import type { ContentTargetKind } from "./content-safety";

const COOKIE_NAME = "student_session";
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const USE_SECURE_STUDENT_COOKIE = process.env.NODE_ENV === "production";

interface StudentPayload {
  studentId: string;
  classroomId: string;
  sessionVersion: number;
  exp: number;
}

function getSecret(): string | null {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : "dev-secret";
}

function sign(payload: StudentPayload): string {
  const secret = getSecret();
  if (!secret) throw new Error("AUTH_SECRET is required in production");
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  const sig = createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verify(token: string): StudentPayload | null {
  const secret = getSecret();
  if (!secret) return null;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  const expected = createHmac("sha256", secret).update(b64).digest("base64url");
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
  const student = await db.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { sessionVersion: true },
  });
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

export type CurrentStudentIdentity = {
  id: string;
  name: string;
  classroomId: string;
  /** Provisioned classroom-wallet identifiers, when they already exist. */
  accountId?: string | null;
  accountCardId?: string | null;
  /** Private per-student UGC visibility state loaded with the identity row. */
  hiddenTargets?: Array<{
    targetKind: ContentTargetKind;
    targetId: string;
  }>;
  hiddenAuthorStudentIds?: string[];
};

type StudentIdentityCacheEntry = {
  value: CurrentStudentIdentity;
  expiresAt: number;
};

const STUDENT_IDENTITY_CACHE_TTL_MS = 60_000;
const STUDENT_IDENTITY_CACHE_MAX = 5_000;
const studentIdentityCache = new Map<string, StudentIdentityCacheEntry>();
const studentIdentityInflight = new Map<
  string,
  Promise<CurrentStudentIdentity | null>
>();
let studentIdentityCacheGeneration = 0;

function studentIdentityCacheKey(payload: StudentPayload): string {
  return `${payload.studentId}:${payload.sessionVersion}`;
}

function cloneStudentIdentity(
  identity: CurrentStudentIdentity,
): CurrentStudentIdentity {
  return {
    ...identity,
    hiddenTargets: identity.hiddenTargets?.map((target) => ({ ...target })),
    hiddenAuthorStudentIds: identity.hiddenAuthorStudentIds
      ? [...identity.hiddenAuthorStudentIds]
      : undefined,
  };
}

function getCachedStudentIdentity(
  key: string,
  now = Date.now(),
): CurrentStudentIdentity | null {
  const cached = studentIdentityCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    studentIdentityCache.delete(key);
    return null;
  }
  // Sliding TTL keeps an actively used classroom session hot while explicit
  // reissue/delete/admin rotation invalidation preserves revocation semantics.
  cached.expiresAt = now + STUDENT_IDENTITY_CACHE_TTL_MS;
  studentIdentityCache.delete(key);
  studentIdentityCache.set(key, cached);
  return cloneStudentIdentity(cached.value);
}

function storeStudentIdentity(
  key: string,
  identity: CurrentStudentIdentity,
): void {
  while (studentIdentityCache.size >= STUDENT_IDENTITY_CACHE_MAX) {
    const oldest = studentIdentityCache.keys().next().value as string | undefined;
    if (!oldest) break;
    studentIdentityCache.delete(oldest);
  }
  studentIdentityCache.set(key, {
    value: cloneStudentIdentity(identity),
    expiresAt: Date.now() + STUDENT_IDENTITY_CACHE_TTL_MS,
  });
}

export function invalidateStudentIdentityCache(studentId?: string): void {
  studentIdentityCacheGeneration += 1;
  if (!studentId) {
    studentIdentityCache.clear();
    studentIdentityInflight.clear();
    return;
  }
  const prefix = `${studentId}:`;
  for (const key of studentIdentityCache.keys()) {
    if (key.startsWith(prefix)) studentIdentityCache.delete(key);
  }
  for (const key of studentIdentityInflight.keys()) {
    if (key.startsWith(prefix)) studentIdentityInflight.delete(key);
  }
}

export function clearStudentIdentityCacheForTests(): void {
  invalidateStudentIdentityCache();
}

async function getVerifiedStudentPayload(): Promise<StudentPayload | null> {
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
  return verify(token);
}

/**
 * Hot-path student identity lookup. Avoids loading the Classroom/teacher graph
 * when a route only needs the authenticated student's primary identifiers.
 */
export async function getCurrentStudentIdentityRaw(): Promise<CurrentStudentIdentity | null> {
  const payload = await getVerifiedStudentPayload();
  if (!payload) return null;
  const key = studentIdentityCacheKey(payload);
  const cached = getCachedStudentIdentity(key);
  if (cached) return cached;
  const inflight = studentIdentityInflight.get(key);
  if (inflight) return inflight;

  const generation = studentIdentityCacheGeneration;
  const pending = db.student
    .findUnique({
      where: { id: payload.studentId },
      select: {
        id: true,
        name: true,
        classroomId: true,
        sessionVersion: true,
        account: {
          select: {
            id: true,
            cards: { take: 1, select: { id: true } },
          },
        },
        hiddenContent: {
          select: { targetKind: true, targetId: true },
        },
        hiddenByStudents: {
          select: { hiddenStudentId: true },
        },
      },
    })
    .then((student) => {
      if (!student || student.sessionVersion !== payload.sessionVersion) return null;
      const identity = {
        id: student.id,
        name: student.name,
        classroomId: student.classroomId,
        accountId: student.account?.id ?? null,
        accountCardId: student.account?.cards[0]?.id ?? null,
        hiddenTargets: student.hiddenContent.map((target) => ({
          targetKind: target.targetKind,
          targetId: target.targetId,
        })),
        hiddenAuthorStudentIds: student.hiddenByStudents.map(
          (author) => author.hiddenStudentId,
        ),
      };
      if (generation === studentIdentityCacheGeneration) {
        storeStudentIdentity(key, identity);
      }
      return cloneStudentIdentity(identity);
    })
    .finally(() => {
      if (studentIdentityInflight.get(key) === pending) {
        studentIdentityInflight.delete(key);
      }
    });
  studentIdentityInflight.set(key, pending);
  return pending;
}

export async function getCurrentStudentIdentity(): Promise<CurrentStudentIdentity | null> {
  // Teacher session wins: if a NextAuth user is authenticated, ignore any
  // stale student cookie. Same browser commonly carries both (teacher tests
  // a student login) and mis-attribution of actions to the student is the
  // class of bug that motivated this gate.
  const user = await getCurrentUser().catch(() => null);
  if (user) return null;
  return getCurrentStudentIdentityRaw();
}

export async function getCurrentStudent() {
  const user = await getCurrentUser().catch(() => null);
  if (user) return null;
  return getCurrentStudentRaw();
}

export async function getCurrentStudentRaw() {
  const payload = await getVerifiedStudentPayload();
  if (!payload) return null;
  const student = await db.student.findUnique({
    where: { id: payload.studentId },
    include: { classroom: { include: { teacher: { select: { email: true } } } } },
  });
  if (!student) return null;
  if (student.sessionVersion !== payload.sessionVersion) return null;
  return student;
}

export async function clearStudentSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
