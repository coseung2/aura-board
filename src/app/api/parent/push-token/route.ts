import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withParentScope } from "@/lib/parent-scope";

const TokenSchema = z.object({
  token: z
    .string()
    .max(512)
    .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),
  platform: z.enum(["android", "ios"]),
});

export async function POST(req: Request) {
  return withParentScope(req, async (ctx) => {
    const parsed = TokenSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_push_token" }, { status: 400 });
    }

    await db.parentPushDevice.upsert({
      where: { expoPushToken: parsed.data.token },
      create: {
        parentId: ctx.parent.id,
        expoPushToken: parsed.data.token,
        platform: parsed.data.platform,
      },
      update: {
        parentId: ctx.parent.id,
        platform: parsed.data.platform,
        disabledAt: null,
      },
    });
    return NextResponse.json({ ok: true });
  });
}

export async function DELETE(req: Request) {
  return withParentScope(req, async (ctx) => {
    const parsed = TokenSchema.pick({ token: true }).safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_push_token" }, { status: 400 });
    }
    await db.parentPushDevice.updateMany({
      where: {
        parentId: ctx.parent.id,
        expoPushToken: parsed.data.token,
        disabledAt: null,
      },
      data: { disabledAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  });
}
