import { redirect } from "next/navigation";

// parent-class-invite-v2 Path A — the v1 invite-code+email form is replaced
// by the 2-step onboarding (email magic-link → class code → student pick).
// Preserve the /parent/join entry point (QR prefill etc.) by redirecting.
//
// legacy /parent/join?code=<classCode> callers (e.g. older QR landing URLs)
// are forwarded to the v2 code-input step with the code preserved as a
// prefill query so it isn't silently dropped on the way through. When no
// code is present we send the parent to the canonical /login surface.

export default async function ParentJoinRedirect({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    error?: string;
    from?: string;
    return?: string;
    callbackUrl?: string;
  }>;
}) {
  const params = await searchParams;
  const { code } = params;
  const trimmed = typeof code === "string" ? code.trim() : "";
  if (trimmed) {
    redirect(`/parent/onboard/match/code?code=${encodeURIComponent(trimmed)}`);
  }

  const query = new URLSearchParams({ role: "parent" });
  for (const key of ["error", "from", "return", "callbackUrl"] as const) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) query.set(key, value);
  }
  redirect(`/login?${query.toString()}`);
}
