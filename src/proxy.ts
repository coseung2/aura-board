/**
 * Next.js 16 request proxy.
 *
 * Intercepts every page request and, when `?as=` or `?theme=` is in the URL,
 * persists the value to a cookie so the server components / API routes can
 * read it via next/headers cookies().
 *
 * This is dev-only plumbing for the mock auth & theme switch — remove before prod.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const VALID_ROLES = new Set(["owner", "editor", "viewer"]);
const SKIP_PREFIXES = ["/_next", "/favicon.ico", "/api/auth", "/api/oauth"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Skip static assets and Next.js internals
  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const asParam = request.nextUrl.searchParams.get("as");
  const res = NextResponse.next();
  if (asParam && VALID_ROLES.has(asParam)) {
    res.cookies.set("as", asParam, { path: "/", sameSite: "lax" });
  }
  return res;
}
