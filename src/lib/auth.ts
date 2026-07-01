/**
 * Unified auth helper.
 *
 * NextAuth OAuth session 만 유일한 교사 식별 경로.
 * 2026-04-22 mock-auth 전면 제거 — `?as=owner|editor|viewer` 쿼리/쿠키로
 * 임의 유저로 로그인하던 개발 fallback은 프로덕션에서 보안 리스크였고, 실제
 * 교사 Google OAuth 로 개발 테스트가 가능해진 이후로 의미가 없어졌다.
 */
import "server-only";
import { db } from "./db";
import { auth } from "./auth-config";

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthenticated");
  }
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    throw new Error("Unauthenticated");
  }
  return user;
}

/**
 * Check if the current request has an authenticated session.
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await auth();
  return !!session?.user?.id;
}
