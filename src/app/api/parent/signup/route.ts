import { NextResponse } from "next/server";

/**
 * Retired email-only signup. The former development implementation returned a
 * usable login link without proving mailbox ownership. Never issue a link,
 * revive a deleted account, or perform a database write from this endpoint.
 * Current clients use password signup or the provider-specific OAuth routes.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "magic_link_retired",
      message: "이메일 링크 로그인은 지원하지 않습니다. 로그인 화면을 이용해 주세요.",
      loginPath: "/login?role=parent",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
