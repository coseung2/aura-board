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

async function loadReadingChampionLogs(
  classroomId: string,
): Promise<ReadingLogRow[]> {
  try {
    return await db.readingLog.findMany({
      where: { classroomId, aiScore: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        studentId: true,
        bookType: true,
        title: true,
        aiScore: true,
        createdAt: true,
      },
    });
  } catch (e) {
    if (isMissingReadingLogTable(e)) {
      console.warn("[morning-summary] ReadingLog table is not available yet.");
      return [];
    }
    throw e;
  }
}

function isMissingReadingLogTable(e: unknown): boolean {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = (e as { code?: unknown }).code;
    if (code === "P2021") return true;
  }
  return e instanceof Error && e.message.includes("ReadingLog");
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

  const [students, readingLogs, tasks, cleaning, shoes, seatLabels] = await Promise.all([
    db.student.findMany({
      where: { classroomId },
      orderBy: [{ number: "asc" }, { name: "asc" }],
      select: { id: true, name: true, number: true },
    }),
    loadReadingChampionLogs(classroomId),
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

  // Reading champions: 점수 합계 상위 5명. 동점이면 최근 등록 log 가 있는
  // 학생을 우선, 그래도 같으면 출석번호 오름차순. TBD — 추후 가중치/주간
  // 윈도우가 정해지면 이 블록만 교체한다.
  const readingChampions = aggregateReadingChampions(readingLogs, students);

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
    readingChampions,
  });
}

type ReadingLogRow = {
  studentId: string;
  bookType: string;
  title: string;
  aiScore: number | null;
  createdAt: Date;
};

type StudentMini = { id: string; name: string; number: number | null };

const READING_CHAMPION_LIMIT = 5;

function aggregateReadingChampions(
  logs: ReadingLogRow[],
  students: StudentMini[],
): Array<{
  student: { id: string; name: string; number: number | null };
  totalScore: number;
  entryCount: number;
  latestTitle: string;
  latestBookType: string;
}> {
  if (logs.length === 0 || students.length === 0) return [];
  const studentById = new Map(students.map((s) => [s.id, s]));

  const buckets = new Map<
    string,
    {
      student: StudentMini;
      totalScore: number;
      entryCount: number;
      latestTitle: string;
      latestBookType: string;
      latestAt: number;
    }
  >();

  for (const log of logs) {
    if (log.aiScore == null) continue;
    const student = studentById.get(log.studentId);
    if (!student) continue;
    const existing = buckets.get(student.id);
    const ts = log.createdAt.getTime();
    if (!existing) {
      buckets.set(student.id, {
        student,
        totalScore: log.aiScore,
        entryCount: 1,
        latestTitle: log.title,
        latestBookType: log.bookType,
        latestAt: ts,
      });
    } else {
      existing.totalScore += log.aiScore;
      existing.entryCount += 1;
      if (ts > existing.latestAt) {
        existing.latestAt = ts;
        existing.latestTitle = log.title;
        existing.latestBookType = log.bookType;
      }
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.latestAt !== a.latestAt) return b.latestAt - a.latestAt;
      const an = a.student.number ?? Number.POSITIVE_INFINITY;
      const bn = b.student.number ?? Number.POSITIVE_INFINITY;
      return an - bn;
    })
    .slice(0, READING_CHAMPION_LIMIT)
    .map((bucket) => ({
      student: {
        id: bucket.student.id,
        name: bucket.student.name,
        number: bucket.student.number,
      },
      totalScore: bucket.totalScore,
      entryCount: bucket.entryCount,
      latestTitle: bucket.latestTitle,
      latestBookType: bucket.latestBookType,
    }));
}
