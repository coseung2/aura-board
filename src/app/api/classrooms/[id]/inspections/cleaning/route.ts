import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";
import { parseDateOrNull, todayDateString } from "@/lib/inspector-findings";

const Body = z.object({
  findings: z
    .array(
      z.object({
        studentId: z.string().min(1),
        dirty: z.boolean(),
        note: z.string().max(120).nullable().optional(),
        photoUrl: z.string().url().max(2000).nullable().optional(),
      }),
    )
    .max(200),
});

async function authorize(classroomId: string) {
  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  if (!user && !student) return { status: 401 as const };

  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { teacherId: true },
  });
  if (!classroom) return { status: 404 as const };

  const isTeacher = user?.id === classroom.teacherId;
  const inspectorAllowed = !isTeacher
    ? await hasPermission(classroomId, { studentId: student?.id }, "inspections.cleaning")
    : false;
  if (!isTeacher && !inspectorAllowed) return { status: 403 as const };
  return { status: 200 as const, student, isTeacher };
}

async function loadSeatLabels(classroomId: string): Promise<Map<string, string>> {
  const groups = await db.classroomDefaultGroup.findMany({
    where: { classroomId },
    orderBy: { order: "asc" },
    select: {
      name: true,
      order: true,
      members: {
        orderBy: { order: "asc" },
        select: { studentId: true, order: true },
      },
    },
  });
  const labels = new Map<string, string>();
  for (const group of groups) {
    const groupLabel = group.name.trim() || `group-${group.order + 1}`;
    for (const member of group.members) {
      labels.set(member.studentId, `${groupLabel}-${member.order + 1}`);
    }
  }
  return labels;
}

function errorForStatus(status: 401 | 403 | 404) {
  if (status === 401) return NextResponse.json({ error: "Unauthorized" }, { status });
  if (status === 403) return NextResponse.json({ error: "Forbidden" }, { status });
  return NextResponse.json({ error: "Not found" }, { status });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const auth = await authorize(classroomId);
  if (auth.status !== 200) return errorForStatus(auth.status);

  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date") ?? todayDateString();
  const date = parseDateOrNull(dateStr);
  if (!date) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const [students, seatLabels, findings] = await Promise.all([
    db.student.findMany({
      where: { classroomId },
      orderBy: [{ number: "asc" }, { name: "asc" }],
      select: { id: true, name: true, number: true },
    }),
    loadSeatLabels(classroomId),
    db.cleaningFinding.findMany({
      where: { classroomId, findingDate: date, dirty: true },
      orderBy: { createdAt: "desc" },
      include: {
        reporter: { select: { id: true, name: true } },
      },
    }),
  ]);

  const findingByStudent = new Map<string, (typeof findings)[number]>();
  for (const finding of findings) {
    if (!findingByStudent.has(finding.markedStudentId)) {
      findingByStudent.set(finding.markedStudentId, finding);
    }
  }

  return NextResponse.json({
    date: dateStr,
    inspector: auth.student ? { id: auth.student.id, name: auth.student.name } : null,
    roster: students.map((student) => {
      const finding = findingByStudent.get(student.id);
      return {
        student,
        seatLabel: seatLabels.get(student.id) ?? null,
        finding: finding
          ? {
              dirty: finding.dirty,
              photoUrl: finding.photoUrl,
              note: finding.note,
              recordedAt: finding.createdAt.toISOString(),
              recordedByName: finding.reporter.name,
            }
          : null,
      };
    }),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;
  const auth = await authorize(classroomId);
  if (auth.status !== 200) return errorForStatus(auth.status);
  if (auth.isTeacher || !auth.student) {
    return NextResponse.json(
      { error: "Only the student inspector can save results." },
      { status: 403 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid findings" }, { status: 400 });
  }

  const dateStr = todayDateString();
  const date = parseDateOrNull(dateStr);
  if (!date) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const studentIds = Array.from(new Set(parsed.data.findings.map((finding) => finding.studentId)));
  const students = await db.student.findMany({
    where: { classroomId, id: { in: studentIds } },
    select: { id: true },
  });
  if (students.length !== studentIds.length) {
    return NextResponse.json({ error: "Student not in classroom" }, { status: 400 });
  }

  const dirtyFindings = parsed.data.findings.filter((finding) => finding.dirty);
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.cleaningFinding.deleteMany({
      where: { classroomId, findingDate: date },
    });
    if (dirtyFindings.length > 0) {
      await tx.cleaningFinding.createMany({
        data: dirtyFindings.map((finding) => ({
          classroomId,
          reporterId: auth.student!.id,
          markedStudentId: finding.studentId,
          dirty: true,
          note: finding.note?.trim() || null,
          photoUrl: finding.photoUrl ?? null,
          findingDate: date,
          createdAt: now,
          updatedAt: now,
        })),
      });
    }
  });

  return NextResponse.json({ savedAt: now.toISOString() });
}
