const COMMON_BLOCKED_RETURN_TARGETS = [
  "/api",
  "/landing",
  "/login",
  "/student/login",
] as const;

const STUDENT_BLOCKED_RETURN_TARGETS = [
  "/dashboard",
  "/classroom",
  "/account",
  "/admin",
  "/teacher",
  "/parent",
] as const;

function matchesPathPrefix(raw: string, target: string): boolean {
  return (
    raw === target ||
    raw.startsWith(`${target}?`) ||
    raw.startsWith(`${target}/`)
  );
}

export function safeLoginReturnTarget(
  raw: string | null | undefined,
  fallback: string,
  blockedTargets: readonly string[] = [],
): string {
  const allBlockedTargets = [
    ...COMMON_BLOCKED_RETURN_TARGETS,
    ...blockedTargets,
  ];
  if (
    raw &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    raw !== "/" &&
    !allBlockedTargets.some((target) => matchesPathPrefix(raw, target))
  ) {
    return raw;
  }
  return fallback;
}

export function safeStudentLoginReturnTarget(
  raw: string | null | undefined,
  fallback = "/student",
): string {
  const safeFallback = safeLoginReturnTarget(
    fallback,
    "/student",
    STUDENT_BLOCKED_RETURN_TARGETS,
  );
  return safeLoginReturnTarget(
    raw,
    safeFallback,
    STUDENT_BLOCKED_RETURN_TARGETS,
  );
}

export function safeTeacherLoginReturnTarget(
  raw: string | null | undefined,
): string {
  return safeLoginReturnTarget(raw, "/dashboard");
}
