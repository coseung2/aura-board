import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { parseDateOrNull } from "./inspector-findings";
import { getWalkingDayKey } from "./walking";

/**
 * One headline metric per child page under /classroom/:id/* so the class home
 * acts like a real home: every feature page is summarized in place and the
 * teacher can jump straight to it.
 */
export type ClassroomHomeSummary = {
  students: { total: number };
  groups: { groupCount: number; seatedCount: number };
  boards: { count: number };
  roles: { assignedCount: number };
  morning: { dutyCount: number; findingCount: number };
  assignments: { missingCount: number };
  checks: { activeCount: number };
  bank: {
    totalBalance: number;
    accountCount: number;
    transactionCount: number;
    unitLabel: string;
  };
  pay: { todayChargeCount: number };
  store: { itemCount: number };
  portfolio: { itemCount: number };
  reading: { logCount: number };
  walking: { connectedCount: number; todaySteps: number };
  banners: { pendingCount: number };
  parents: { pendingCount: number; activeCount: number };
};

const MISSING_SLOT_STATUSES = ["assigned", "returned", "orphaned"];

function isMissingReadingLogTable(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "P2021") return true;
  }
  return (
    error instanceof Error &&
    (error.message.includes("ReadingLog") || error.message.includes("readingLog"))
  );
}

type WalkingTotalsRow = {
  studentCount: number;
  connectedCount: number;
  todaySteps: number;
};

/** Load the compact per-page summary data for a teacher-owned classroom. */
export async function getClassroomHomeSummary(
  classroomId: string,
): Promise<ClassroomHomeSummary> {
  // 오늘(Asia/Seoul) 시작 시각. 청소 당번/QR 결제는 KST 하루 단위로 센다.
  const kstToday = parseDateOrNull(getWalkingDayKey());

  const [
    studentIds,
    groupCount,
    seatedCount,
    boardCount,
    roleAssignmentRows,
    dutyCount,
    findingCount,
    activeCheckTasks,
    missingSlotCount,
    sectionAssignments,
    accountAggregate,
    transactionCount,
    storeItemCount,
    payTodayCount,
    readingLogCount,
    walkingTotals,
    bannerPendingCount,
    parentPendingCount,
    parentActiveCount,
    authoredCardCount,
    portfolioAssetCount,
    unitLabel,
  ] = await Promise.all([
    db.student.findMany({
      where: { classroomId },
      select: { id: true },
    }),
    db.classroomDefaultGroup.count({ where: { classroomId } }),
    db.classroomDefaultGroupMember
      .findMany({
        where: { classroomId },
        select: { studentId: true },
        distinct: ["studentId"],
      })
      .then((rows) => rows.length),
    db.board.count({ where: { classroomId } }),
    db.classroomRoleAssignment.findMany({
      where: { classroomId },
      select: { studentId: true },
      distinct: ["studentId"],
    }),
    db.cleaningDuty.count({
      where: { classroomId, dutyDate: kstToday ?? undefined },
    }),
    db.cleaningFinding.count({
      where: { classroomId, findingDate: kstToday ?? undefined, dirty: true },
    }).then((cleaning) =>
      db.shoeFinding.count({
        where: { classroomId, findingDate: kstToday ?? undefined, notArranged: true },
      }).then((shoes) => cleaning + shoes),
    ),
    db.classroomCheckTask.findMany({
      where: { classroomId, isActive: true },
      select: {
        id: true,
        submissions: {
          where: { submitted: true },
          select: { studentId: true },
        },
      },
    }),
    db.assignmentSlot.count({
      where: {
        board: { classroomId, layout: "assignment" },
        submissionStatus: { in: MISSING_SLOT_STATUSES },
      },
    }),
    db.section.findMany({
      where: {
        assignmentPublishedAt: { not: null },
        board: { classroomId, layout: "columns" },
      },
      select: {
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
    }),
    db.studentAccount.aggregate({
      where: { classroomId },
      _sum: { balance: true },
      _count: true,
    }),
    db.transaction.count({ where: { account: { classroomId } } }),
    db.storeItem.count({ where: { classroomId, archived: false } }),
    db.transaction.count({
      where: {
        account: { classroomId },
        type: "purchase",
        createdAt: { gte: kstToday ?? undefined },
      },
    }),
    loadReadingLogCount(classroomId),
    loadWalkingTotals(classroomId),
    db.dailyBannerSubmission.count({
      where: { classroomId, status: "pending" },
    }),
    db.parentChildLink.count({
      where: {
        student: { classroomId },
        status: "pending",
        deletedAt: null,
      },
    }),
    db.parentChildLink.count({
      where: {
        student: { classroomId },
        status: "active",
        deletedAt: null,
      },
    }),
    db.card.count({
      where: {
        studentAuthorId: { not: null },
        studentAuthor: { classroomId },
        OR: [{ queueStatus: null }, { queueStatus: { not: "played" } }],
      },
    }),
    db.studentAsset.count({ where: { classroomId } }),
    db.classroomCurrency
      .findUnique({
        where: { classroomId },
        select: { unitLabel: true },
      })
      .then((currency) => currency?.unitLabel ?? "원"),
  ]);

  const totalStudents = studentIds.length;

  // 체크 과제 미제출 학생 수: 활성 과제 중 하나라도 제출하지 않은 학생.
  const missingTaskStudents = studentIds.filter((student) =>
    activeCheckTasks.some(
      (task) =>
        !task.submissions.some((submission) => submission.studentId === student.id),
    ),
  ).length;

  // 주제별 보드(columns) 섹션 과제 미제출 학생 수.
  const missingSectionStudents = sectionAssignments.reduce(
    (sum, section) => {
      const studentIdsWithCards = new Set<string>();
      for (const card of section.cards) {
        if (card.studentAuthorId) studentIdsWithCards.add(card.studentAuthorId);
        for (const author of card.authors) {
          if (author.studentId) studentIdsWithCards.add(author.studentId);
        }
      }
      return (
        sum +
        studentIds.filter((student) => !studentIdsWithCards.has(student.id))
          .length
      );
    },
    0,
  );

  return {
    students: { total: totalStudents },
    groups: { groupCount, seatedCount },
    boards: { count: boardCount },
    roles: { assignedCount: roleAssignmentRows.length },
    morning: { dutyCount, findingCount },
    assignments: {
      missingCount:
        missingTaskStudents + missingSlotCount + missingSectionStudents,
    },
    checks: { activeCount: activeCheckTasks.length },
    bank: {
      totalBalance: accountAggregate._sum.balance ?? 0,
      accountCount: accountAggregate._count,
      transactionCount,
      unitLabel,
    },
    pay: { todayChargeCount: payTodayCount },
    store: { itemCount: storeItemCount },
    portfolio: {
      itemCount: authoredCardCount + portfolioAssetCount,
    },
    reading: { logCount: readingLogCount },
    walking: {
      connectedCount: walkingTotals.connectedCount,
      todaySteps: walkingTotals.todaySteps,
    },
    banners: { pendingCount: bannerPendingCount },
    parents: { pendingCount: parentPendingCount, activeCount: parentActiveCount },
  };
}

async function loadReadingLogCount(classroomId: string): Promise<number> {
  if (!db.readingLog) {
    console.warn("[classroom-home-summary] ReadingLog delegate is not available yet.");
    return 0;
  }
  try {
    return await db.readingLog.count({ where: { classroomId } });
  } catch (error) {
    if (isMissingReadingLogTable(error)) {
      console.warn("[classroom-home-summary] ReadingLog table is not available yet.");
      return 0;
    }
    throw error;
  }
}

async function loadWalkingTotals(
  classroomId: string,
): Promise<{ connectedCount: number; todaySteps: number }> {
  const rows = await db.$queryRaw<WalkingTotalsRow[]>(Prisma.sql`
    SELECT
      COUNT(*)::int AS "studentCount",
      COUNT(DISTINCT CASE WHEN w."studentId" IS NOT NULL THEN s.id END)::int AS "connectedCount",
      COALESCE(SUM(CASE WHEN w."day" = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date THEN w."steps" ELSE 0 END), 0)::int AS "todaySteps"
    FROM "Student" s
    LEFT JOIN "StudentWalkingDailyStat" w
      ON w."studentId" = s.id
      AND w."day" >= ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date - 6)
      AND w."day" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date
    WHERE s."classroomId" = ${classroomId}
  `);
  const row = rows[0];
  if (!row) return { connectedCount: 0, todaySteps: 0 };
  return {
    connectedCount: Number(row.connectedCount) || 0,
    todaySteps: Number(row.todaySteps) || 0,
  };
}
