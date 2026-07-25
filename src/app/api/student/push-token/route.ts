import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";

export const runtime = "nodejs";

const TokenSchema = z.object({
  token: z
    .string()
    .max(512)
    .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),
  platform: z.enum(["android", "ios"]),
});

export async function POST(req: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = TokenSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_push_token" }, { status: 400 });
  }

  await db.studentPushDevice.upsert({
    where: { expoPushToken: parsed.data.token },
    create: {
      studentId: student.id,
      expoPushToken: parsed.data.token,
      platform: parsed.data.platform,
    },
    update: {
      studentId: student.id,
      platform: parsed.data.platform,
      disabledAt: null,
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = TokenSchema.pick({ token: true }).safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_push_token" }, { status: 400 });
  }

  await db.studentPushDevice.updateMany({
    where: {
      studentId: student.id,
      expoPushToken: parsed.data.token,
      disabledAt: null,
    },
    data: { disabledAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
