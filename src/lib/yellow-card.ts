import "server-only";
import { db } from "./db";
import { parseDateOrNull, todayDateString } from "./inspector-findings";

/**
 * Yellow card + cleaning duty helpers (2026-07-08).
 *
 * Yellow cards are classroom-scoped behavioral notes. When a student receives
 * their 2nd card on the same day, the helper also creates a CleaningDuty row
 * for today (idempotent — the unique key on (classroomId, studentId, dutyDate)
 * prevents duplicates). The "same day" boundary uses the UTC date of
 * givenAt, matching the morning-summary convention.
 */

export type YellowCardActor =
  | { kind: "teacher"; userId: string }
  | { kind: "student"; studentId: string };

export type GiveYellowCardResult = {
  card: {
    id: string;
    studentId: string;
    reason: string;
    givenAt: Date;
  };
  /** 부여 *후* 의 오늘 누적 카드 수 (1 또는 그 이상). */
  todayCount: number;
  /** 두 번째 이상 카드일 때 true, 동시에 청소 당번에 자동 등록됨. */
  promotedToCleaningDuty: boolean;
  cleaningDutyId: string | null;
};

/**
 * 한 학생에게 노란 카드를 부여한다. 같은 날 두 번째 카드면 자동으로
 * 오늘의 청소 당번에도 등록한다 (둘 다 같은 트랜잭션).
 */
export async function giveYellowCard(
  classroomId: string,
  studentId: string,
  reason: string,
  actor: YellowCardActor,
  options: { now?: Date } = {},
): Promise<GiveYellowCardResult> {
  const now = options.now ?? new Date();
  const today = parseDateOrNull(todayDateString());
  if (!today) {
    throw new Error("Invalid today date");
  }
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error("reason is required");
  }

  return db.$transaction(async (tx) => {
    const existing = await tx.yellowCard.count({
      where: {
        classroomId,
        studentId,
        givenAt: { gte: today, lt: tomorrow },
      },
    });

    const card = await tx.yellowCard.create({
      data: {
        classroomId,
        studentId,
        givenByStudentId: actor.kind === "student" ? actor.studentId : null,
        givenByUserId: actor.kind === "teacher" ? actor.userId : null,
        reason: trimmedReason,
        givenAt: now,
      },
      select: { id: true, studentId: true, reason: true, givenAt: true },
    });

    const todayCount = existing + 1;
    let promotedToCleaningDuty = false;
    let cleaningDutyId: string | null = null;

    if (todayCount >= 2) {
      const duty = await tx.cleaningDuty.upsert({
        where: {
          classroomId_studentId_dutyDate: {
            classroomId,
            studentId,
            dutyDate: today,
          },
        },
        create: {
          classroomId,
          studentId,
          dutyDate: today,
          source: "yellow_card",
          assignedByStudentId: actor.kind === "student" ? actor.studentId : null,
          assignedByUserId: actor.kind === "teacher" ? actor.userId : null,
        },
        update: {},
        select: { id: true },
      });
      cleaningDutyId = duty.id;
      promotedToCleaningDuty = true;
    }

    return {
      card,
      todayCount,
      promotedToCleaningDuty,
      cleaningDutyId,
    };
  });
}

export type YellowCardRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: number | null;
  reason: string;
  givenAt: Date;
  givenByStudentName: string | null;
  givenByUserName: string | null;
};

/**
 * 오늘 부여된 노란 카드 목록 (가장 최근 순). 학생 정보와 부여자 이름을
 * join 해서 반환한다.
 */
export async function getTodayYellowCards(
  classroomId: string,
): Promise<YellowCardRow[]> {
  const today = parseDateOrNull(todayDateString());
  if (!today) return [];
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db.yellowCard.findMany({
    where: {
      classroomId,
      givenAt: { gte: today, lt: tomorrow },
    },
    orderBy: { givenAt: "desc" },
    select: {
      id: true,
      studentId: true,
      reason: true,
      givenAt: true,
      student: { select: { name: true, number: true } },
      givenBy: { select: { name: true } },
      givenByUser: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.name,
    studentNumber: row.student.number,
    reason: row.reason,
    givenAt: row.givenAt,
    givenByStudentName: row.givenBy?.name ?? null,
    givenByUserName: row.givenByUser?.name ?? null,
  }));
}

export type CleaningDutyRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentNumber: number | null;
  dutyDate: Date;
  source: string;
  assignedAt: Date;
};

/**
 * 오늘의 청소 당번 명단. 출석번호 오름차순, 동률이면 이름 오름차순.
 */
export async function getTodayCleaningDuty(
  classroomId: string,
): Promise<CleaningDutyRow[]> {
  const today = parseDateOrNull(todayDateString());
  if (!today) return [];
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db.cleaningDuty.findMany({
    where: {
      classroomId,
      dutyDate: { gte: today, lt: tomorrow },
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      studentId: true,
      dutyDate: true,
      source: true,
      createdAt: true,
      student: { select: { name: true, number: true } },
    },
  });

  rows.sort((a, b) => {
    const an = a.student.number ?? Number.POSITIVE_INFINITY;
    const bn = b.student.number ?? Number.POSITIVE_INFINITY;
    if (an !== bn) return an - bn;
    return a.student.name.localeCompare(b.student.name, "ko");
  });

  return rows.map((row) => ({
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.name,
    studentNumber: row.student.number,
    dutyDate: row.dutyDate,
    source: row.source,
    assignedAt: row.createdAt,
  }));
}
