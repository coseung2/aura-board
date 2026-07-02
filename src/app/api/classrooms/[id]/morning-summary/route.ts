import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseDateOrNull, todayDateString } from "@/lib/inspector-findings";

function nextDay(date: Date) {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: classroomId } = await params;

  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const classroom = await db.classroom.findUnique({
    where: { id: classroomId },
    select: { id: true, name: true, teacherId: true },
  });
  if (!classroom) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (classroom.teacherId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date") ?? todayDateString();
  const date = parseDateOrNull(dateStr);
  if (!date) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const tomorrow = nextDay(date);

  const [students, tasks, cleaning, shoes, seatLabels] = await Promise.all([
    db.student.findMany({
      where: { classroomId },
      orderBy: [{ number: "asc" }, { name: "asc" }],
      select: { id: true, name: true, number: true },
    }),
    db.classroomCheckTask.findMany({
      where: {
        classroomId,
        isActive: true,
        OR: [{ dueDate: null }, { dueDate: { lt: tomorrow } }],
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        dueDate: true,
        submissions: {
          where: { submitted: true },
          select: { studentId: true },
        },
      },
    }),
    db.cleaningFinding.findMany({
      where: { classroomId, findingDate: date, dirty: true },
      orderBy: { createdAt: "desc" },
      include: {
        reporter: { select: { id: true, name: true, number: true } },
        markedStudent: { select: { id: true, name: true, number: true } },
      },
    }),
    db.shoeFinding.findMany({
      where: { classroomId, findingDate: date, notArranged: true },
      orderBy: { createdAt: "desc" },
      include: {
        reporter: { select: { id: true, name: true, number: true } },
        markedStudent: { select: { id: true, name: true, number: true } },
      },
    }),
    loadSeatLabels(classroomId),
  ]);

  const missingAssignments = students
    .map((student) => {
      const missingTasks = tasks
        .filter((task) => !task.submissions.some((submission) => submission.studentId === student.id))
        .map((task) => ({
          id: task.id,
          title: task.title,
          dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        }));
      if (missingTasks.length === 0) return null;
      return { student, tasks: missingTasks };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const cleaningFindings = cleaning.map((row) => ({
    student: row.markedStudent,
    seatLabel: seatLabels.get(row.markedStudentId) ?? null,
    photoUrl: row.photoUrl,
    note: row.note,
    recordedByName: row.reporter.name,
  }));

  const shoeFindings = shoes.map((row) => ({
    student: row.markedStudent,
    recordedByName: row.reporter.name,
  }));

  return NextResponse.json({
    date: dateStr,
    classroomName: classroom.name,
    kpis: {
      totalStudents: students.length,
      missingAssignmentCount: missingAssignments.length,
      cleaningDirtyCount: cleaningFindings.length,
      shoeNotArrangedCount: shoeFindings.length,
    },
    missingAssignments,
    cleaningFindings,
    shoeFindings,
  });
}
