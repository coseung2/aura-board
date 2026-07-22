import { redirect } from "next/navigation";

// Preserve this terminal URL for existing parent bookmarks and client-side
// watchdogs, while sending every login state to the canonical /login UI.

export const dynamic = "force-dynamic";

export default async function ParentLoggedOutRedirect({
  searchParams,
}: {
  searchParams: Promise<{
    logout?: string;
    withdrawn?: string;
    error?: string;
    from?: string;
    return?: string;
    callbackUrl?: string;
  }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ role: "parent" });

  const error =
    params.withdrawn === "1"
      ? "withdrawn"
      : params.logout === "1"
        ? "logged_out"
        : params.error;
  if (error?.trim()) query.set("error", error);

  for (const key of ["from", "return", "callbackUrl"] as const) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) query.set(key, value);
  }

  redirect(`/login?${query.toString()}`);
}
