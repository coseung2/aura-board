import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "invalid_secret" }, { status: 401 });
  }
  const email = new URL(req.url).searchParams.get("teacherEmail")?.trim().toLowerCase();
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
        studentsWithActiveToken: classroom.students.filter((student) =>
          student.pushDevices.some((device) => device.disabledAt === null),
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
