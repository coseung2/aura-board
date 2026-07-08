/**
 * Admin gate (2026-07-08)
 *
 * 개발 중(dev-only) 기능에 대한 관리자 권한을 확인하는 헬퍼.
 * 환경변수 AURA_ADMIN_EMAILS(콤마 구분)로 확장 가능하고, 기본값은
 * mallagaenge@gmail.com 한 명.
 */

const DEFAULT_ADMIN_EMAIL = "mallagaenge@gmail.com";

export function getAdminEmails(): string[] {
  return (process.env.AURA_ADMIN_EMAILS ?? DEFAULT_ADMIN_EMAIL)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}
