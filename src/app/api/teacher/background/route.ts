import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SaveSchema = z.object({
  url: z.string().trim().url().max(2000).nullable(),
});

export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ url: user.appBackgroundUrl ?? null });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = SaveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const nextUrl = parsed.data.url?.trim() || null;
  const updated = await db.user.update({
    where: { id: user.id },
    data: { appBackgroundUrl: nextUrl },
    select: { appBackgroundUrl: true },
  });

  return NextResponse.json({ url: updated.appBackgroundUrl ?? null });
}
