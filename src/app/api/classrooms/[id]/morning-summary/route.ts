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
  if (!db.readingLog) {
    console.warn("[morning-summary] ReadingLog delegate is not available yet.");
    return [];
  }
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
  return (
    e instanceof Error &&
    (e.message.includes("ReadingLog") || e.message.includes("readingLog"))
  );
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

  const [students, readingLogs, tasks, cleaning, shoes, seatLabels, assignmentSlots, sectionAssignments] = await Promise.all([
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
        reporterUser: { select: { id: true, name: true } },
        markedStudent: { select: { id: true, name: true, number: true } },
      },
    }),
    db.shoeFinding.findMany({
      where: { classroomId, findingDate: date, notArranged: true },
      orderBy: { createdAt: "desc" },
      include: {
        reporter: { select: { id: true, name: true, number: true } },
        reporterUser: { select: { id: true, name: true } },
        markedStudent: { select: { id: true, name: true, number: true } },
      },
    }),
    loadSeatLabels(classroomId),
    loadAssignmentSlotStatus(classroomId, tomorrow),
    loadSectionAssignmentStatus(classroomId),
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

  const missingAssignmentBoards = students
    .map((student) => {
      const entries = assignmentSlots
        .filter((slot) => slot.studentId === student.id && isSlotMissing(slot.submissionStatus))
        .map((slot) => ({
          id: slot.boardId,
          title: slot.boardTitle,
          dueDate: slot.boardDeadline ? slot.boardDeadline.toISOString() : null,
        }));
      if (entries.length === 0) return null;
      return { student, boards: entries };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  // 주제별 보드의 섹션 과제 미제출
  const missingSectionAssignments = students
    .map((student) => {
      const entries = sectionAssignments
        .filter((section) => !section.studentIdsWithCards.includes(student.id))
        .map((section) => ({
          id: section.sectionId,
          title: section.sectionTitle + ' (' + section.boardTitle + ')',
          dueDate: section.publishedAt,
        }));
      if (entries.length === 0) return null;
      return { student, boards: entries };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const cleaningFindings = cleaning.map((row) => ({
    student: row.markedStudent,
    seatLabel: seatLabels.get(row.markedStudentId) ?? null,
    photoUrl: row.photoUrl,
    note: row.note,
    recordedByName: row.reporter?.name ?? row.reporterUser?.name ?? null,
  }));

  const shoeFindings = shoes.map((row) => ({
    student: row.markedStudent,
    recordedByName: row.reporter?.name ?? row.reporterUser?.name ?? null,
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
      missingAssignmentBoardCount: missingAssignmentBoards.length + missingSectionAssignments.length,
      cleaningDirtyCount: cleaningFindings.length,
      shoeNotArrangedCount: shoeFindings.length,
    },
    missingAssignments,
    missingAssignmentBoards: [...missingAssignmentBoards, ...missingSectionAssignments],
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


/**
 * Subject board (columns layout) 섹션 과제 미제출 조회 (2026-07-09)
 *
 * 학급에 속한 Board(layout="columns") 중 assignmentPublishedAt 이 설정된
 * 섹션을 찾아 각 학생의 카드 제출 여부를 확인한다.
 * 섹션 과제는 별도의 마감일이 없으므로, published 이후 하루가 지난 과제만
 * 미제출로 표시한다 (당일 배부는 제외).
 */
type SectionAssignmentSnapshot = {
  sectionId: string;
  sectionTitle: string;
  boardId: string;
  boardTitle: string;
  publishedAt: string;
  studentIdsWithCards: string[];
};

async function loadSectionAssignmentStatus(
  classroomId: string,
): Promise<SectionAssignmentSnapshot[]> {
  const sections = await db.section.findMany({
    where: {
      assignmentPublishedAt: { not: null },
      board: {
        classroomId,
        layout: "columns",
      },
    },
    select: {
      id: true,
      title: true,
      assignmentPublishedAt: true,
      board: { select: { id: true, title: true } },
      cards: {
        select: {
          studentAuthorId: true,
          authors: {
            where: { studentId: { not: null } },
            select: { studentId: true },
          },
        },
      },
    },
  });

  return sections.map((section) => {
    const studentIdsWithCards = new Set<string>();
    for (const card of section.cards) {
      if (card.studentAuthorId) studentIdsWithCards.add(card.studentAuthorId);
      for (const author of card.authors) {
        if (author.studentId) studentIdsWithCards.add(author.studentId);
      }
    }
    return {
      sectionId: section.id,
      sectionTitle: section.title,
      boardId: section.board.id,
      boardTitle: section.board.title,
      publishedAt: section.assignmentPublishedAt!.toISOString(),
      studentIdsWithCards: Array.from(studentIdsWithCards),
    };
  });
}

/**
 * Assignment board 미제출 슬롯 조회 (2026-07-08)
 *
 * 학급에 속한 Board(layout="assignment") 중 마감 기한이 아직 지나지 않은
 * 보드의 AssignmentSlot 을 모두 가져온다. 반환 row 는 미제출 여부 판단만
 * 하면 되므로 board id/title/deadline + studentId + submissionStatus 만
 * select 해서 페이로드 크기를 줄인다.
 */
type AssignmentSlotSnapshot = {
  boardId: string;
  boardTitle: string;
  boardDeadline: Date | null;
  studentId: string;
  submissionStatus: string;
};

async function loadAssignmentSlotStatus(
  classroomId: string,
  tomorrow: Date,
): Promise<AssignmentSlotSnapshot[]> {
  return db.assignmentSlot.findMany({
    where: {
      board: {
        classroomId,
        layout: "assignment",
        // deadline 이 없거나 (null) 아직 지나지 않은 보드만 활성으로 본다.
        OR: [{ assignmentDeadline: null }, { assignmentDeadline: { lt: tomorrow } }],
      },
    },
    select: {
      boardId: true,
      studentId: true,
      submissionStatus: true,
      board: { select: { title: true, assignmentDeadline: true } },
    },
  }).then((rows) =>
    rows.map((row) => ({
      boardId: row.boardId,
      boardTitle: row.board.title,
      boardDeadline: row.board.assignmentDeadline,
      studentId: row.studentId,
      submissionStatus: row.submissionStatus,
    })),
  );
}

/**
 * 슬롯이 미제출인지 판정. assignment-state 의 SUBMISSION_STATUS 와 같은
 * 의미이지만 서버 사이드에서 단일 출처로 굳이 import 하지 않고 enum 값을
 * 하드코딩한다 (v1: assigned/returned/orphaned 만 미제출로 간주).
 */
function isSlotMissing(submissionStatus: string): boolean {
  return (
    submissionStatus === "assigned" ||
    submissionStatus === "returned" ||
    submissionStatus === "orphaned"
  );
}
