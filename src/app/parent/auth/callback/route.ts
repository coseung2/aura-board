import { NextResponse } from "next/server";

/** Invalidate legacy links, including links previously exposed by signup. */
export async function GET() {
  return NextResponse.json(
    {
      error: "magic_link_retired",
      message: "이 로그인 링크는 더 이상 사용할 수 없습니다. 다시 로그인해 주세요.",
      loginPath: "/login?role=parent",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
