/**
 * The authenticated person behind a role session.
 *
 * Teacher and parent use different session mechanisms, but they may coexist
 * only when both sessions belong to the same verified email account.
 */
export function normalizeAccountPrincipal(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

/** Unknown emails are deliberately treated as different principals. */
export function isSameAccountPrincipal(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const normalizedLeft = normalizeAccountPrincipal(left);
  const normalizedRight = normalizeAccountPrincipal(right);
  return !!normalizedLeft && normalizedLeft === normalizedRight;
}
