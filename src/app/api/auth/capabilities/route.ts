import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hasPair(id: string | undefined, secret: string | undefined): boolean {
  return Boolean(id?.trim() && secret?.trim());
}

/** Public, value-free inventory used to hide unavailable login buttons. */
export async function GET() {
  const sharedGoogle = hasPair(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  const parentGoogle = hasPair(
    process.env.GOOGLE_PARENT_CLIENT_ID,
    process.env.GOOGLE_PARENT_CLIENT_SECRET,
  );
  const kakao = hasPair(
    process.env.KAKAO_PARENT_CLIENT_ID ?? process.env.AUTH_KAKAO_ID,
    process.env.KAKAO_PARENT_CLIENT_SECRET ?? process.env.AUTH_KAKAO_SECRET,
  );
  const apple = hasPair(
    process.env.AUTH_APPLE_ID,
    process.env.AUTH_APPLE_SECRET,
  );

  return NextResponse.json(
    {
      teacher: { google: sharedGoogle, kakao, apple, password: true },
      parent: {
        google: sharedGoogle || parentGoogle,
        kakao,
        apple,
        password: true,
      },
      student: { code: true },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
