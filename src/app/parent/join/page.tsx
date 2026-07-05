import { redirect } from "next/navigation";

// parent-class-invite-v2 Path A — the v1 invite-code+email form is replaced
// by the 2-step onboarding (email magic-link → class code → student pick).
// Preserve the /parent/join entry point (QR prefill etc.) by redirecting.
//
// legacy /parent/join?code=<classCode> callers (e.g. older QR landing URLs)
// are forwarded to the v2 code-input step with the code preserved as a
// prefill query so it isn't silently dropped on the way through. When no
// code is present we keep the current behavior of bouncing straight to
// signup.

export default async function ParentJoinRedirect({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const trimmed = typeof code === "string" ? code.trim() : "";
  if (trimmed) {
    redirect(
      `/parent/onboard/match/code?code=${encodeURIComponent(trimmed)}`,
    );
  }
  redirect("/parent/onboard/signup");
}
