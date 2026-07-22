import { redirect } from "next/navigation";

// Keep the historical onboarding URL valid for bookmarks and OAuth providers,
// but render the single canonical login surface. Successful OAuth callbacks
// still enter the match flow directly; only this login/error entry is unified.

type SearchParams = Promise<{
  error?: string;
  from?: string;
  return?: string;
  callbackUrl?: string;
}>;

export default async function ParentSignupRedirect({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ role: "parent" });

  for (const key of ["error", "from", "return", "callbackUrl"] as const) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) query.set(key, value);
  }

  redirect(`/login?${query.toString()}`);
}
