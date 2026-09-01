import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function teacherEmail(req: Request): string | null {
  return new URL(req.url).searchParams.get("teacherEmail")?.trim().toLowerCase() || null;
}

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "invalid_secret" }, { status: 401 });
  }
  const email = teacherEmail(req);
  if (!email) {
    return NextResponse.json({ error: "teacher_email_required" }, { status: 400 });
  }

  const teacher = await db.user.findUnique({
    where: { email },
    select: {
      classrooms: {
        orderBy: { createdAt: "asc" },
        select: {
          name: true,
          students: {
            select: {
              pushDevices: { select: { disabledAt: true, platform: true } },
            },
          },
        },
      },
    },
  });
  if (!teacher) {
    return NextResponse.json({ error: "teacher_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    classrooms: teacher.classrooms.map((classroom) => {
      const devices = classroom.students.flatMap((student) => student.pushDevices);
      const active = devices.filter((device) => device.disabledAt === null);
      return {
        classroom: classroom.name,
        students: classroom.students.length,
        studentsWithAnyToken: classroom.students.filter((student) =>
          student.pushDevices.length > 0,
        ).length,
        studentsWithActiveToken: classroom.students.filter((student) =>
          student.pushDevices.some((device) => device.disabledAt === null),
        ).length,
        studentsWithDisabledTokensOnly: classroom.students.filter((student) =>
          student.pushDevices.length > 0 &&
          student.pushDevices.every((device) => device.disabledAt !== null),
        ).length,
        studentsWithoutTokenHistory: classroom.students.filter((student) =>
          student.pushDevices.length === 0,
        ).length,
        activeTokens: active.length,
        disabledTokens: devices.length - active.length,
        totalTokens: devices.length,
        activeByPlatform: {
          android: active.filter((device) => device.platform === "android").length,
          ios: active.filter((device) => device.platform === "ios").length,
        },
      };
    }),
  });
}

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "invalid_secret" }, { status: 401 });
  }
  const email = teacherEmail(req);
  if (!email) {
    return NextResponse.json({ error: "teacher_email_required" }, { status: 400 });
  }
  const body = await req.json().catch(() => null) as
    | { staleDays?: unknown; dryRun?: unknown }
    | null;
  const staleDays = body?.staleDays;
  if (!Number.isInteger(staleDays) || Number(staleDays) < 7 || Number(staleDays) > 365) {
    return NextResponse.json({ error: "invalid_stale_days" }, { status: 400 });
  }
  const cutoff = new Date(Date.now() - Number(staleDays) * 24 * 60 * 60 * 1_000);
  const candidates = await db.studentPushDevice.findMany({
    where: {
      disabledAt: null,
      updatedAt: { lt: cutoff },
      student: { classroom: { teacher: { email } } },
    },
    select: { id: true },
  });
  const dryRun = body?.dryRun !== false;
  const result = dryRun || candidates.length === 0
    ? { count: 0 }
    : await db.studentPushDevice.updateMany({
        where: {
          id: { in: candidates.map((candidate) => candidate.id) },
          disabledAt: null,
          updatedAt: { lt: cutoff },
        },
        data: { disabledAt: new Date() },
      });

  return NextResponse.json({
    staleDays: Number(staleDays),
    cutoff: cutoff.toISOString(),
    dryRun,
    candidates: candidates.length,
    disabled: result.count,
  });
}
