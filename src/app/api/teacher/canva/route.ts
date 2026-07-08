import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isCanvaConnected } from "@/lib/canva";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const connected = await isCanvaConnected(user.id);
  const row = await db.canvaConnectAccount.findUnique({
    where: { userId: user.id },
    select: { createdAt: true },
  });

  return NextResponse.json({
    connected,
    connectedAt: row?.createdAt?.toISOString() ?? null,
  });
}

export async function DELETE() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await db.canvaConnectAccount.updateMany({
    where: { userId: user.id },
    data: { accessToken: null, refreshToken: null, expiresAt: null },
  });
  return NextResponse.json({ connected: false });
}