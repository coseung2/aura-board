import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildAuthorizationUrl, getCanvaClientId } from "@/lib/canva";

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value === "/" || value === "/landing") return "/dashboard";
  return value;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  if (!getCanvaClientId()) {
    return NextResponse.json(
      { error: "Canva API not configured. Set CANVA_CLIENT_ID in .env" },
      { status: 500 }
    );
  }

  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    const startPath = `/api/auth/canva?returnTo=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(startPath)}`, req.url),
    );
  }

  const url = await buildAuthorizationUrl(user.id, returnTo);
  return NextResponse.redirect(url);
}
