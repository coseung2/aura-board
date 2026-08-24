import { redirect } from "next/navigation";

import { AttendanceMission } from "@/components/student/AttendanceMission";
import { ReadingTitles } from "@/components/student/ReadingTitles";
import { StudentActivityTabs } from "@/components/student/StudentActivityTabs";
import { WeeklyReadingMission } from "@/components/student/WeeklyReadingMission";
import { StudentTopNav } from "@/components/StudentTopNav";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import {
  buildReadingWeeklyMissionReward,
  type ReadingWeeklyMissionReward,
} from "@/lib/reading-missions";
import {
  getKstClassroomWalkingRankPeriods,
  READING_WEEKLY_MISSION_REWARD_SOURCE_TYPE,
  readingWeeklyMissionSourceRef,
} from "@/lib/reward-policy";
import { SLIME_COLORS, type SlimeColor } from "@/lib/pets/types";
import { getStudentDuties } from "@/lib/role-portals";
import { getStudentMonthlyAttendance } from "@/lib/student-attendance";
import { getCurrentStudent } from "@/lib/student-auth";

import {
  normalizeActivityView,
  type SelfDirectedSearchParams,
} from "../self-directed/navigation";
import styles from "../self-directed/page.module.css";
import { ReadingForm } from "./ReadingForm";

export const dynamic = "force-dynamic";

async function readReadingWeeklyMissionClaimed(
  studentId: string,
  weekStart: string,
): Promise<boolean> {
  const sourceRef = readingWeeklyMissionSourceRef(studentId, weekStart);
  const deposit = await db.transaction.findFirst({
    where: {
      sourceType: READING_WEEKLY_MISSION_REWARD_SOURCE_TYPE,
      sourceRef,
      type: "deposit",
    },
    select: { id: true },
  });
  return deposit !== null;
}

export default async function StudentReadingPage({
  searchParams,
}: {
  searchParams: Promise<Omit<SelfDirectedSearchParams, "activity">>;
}) {
  const query = await searchParams;
  const initialView = normalizeActivityView("reading", query.tab ?? query.view);
  const student = await getCurrentStudent();

  if (!student) redirect("/login?from=/student/reading");

  const missionPeriod = getKstClassroomWalkingRankPeriods().active;
  const missionWeekStart = new Date(`${missionPeriod.weekStart}T00:00:00+09:00`);
  const missionWeekEnd = new Date(`${missionPeriod.weekEnd}T00:00:00+09:00`);
  const [
    classroom,
    duties,
    attendance,
    weeklyReadingLogs,
    claimed,
    representativeSlime,
  ] = await Promise.all([
      db.classroom.findUnique({
        where: { id: student.classroomId },
        select: { id: true, name: true },
      }),
      getStudentDuties(student.id),
      getStudentMonthlyAttendance(student.id),
      db.readingLog.findMany({
        where: {
          studentId: student.id,
          classroomId: student.classroomId,
          createdAt: { gte: missionWeekStart, lt: missionWeekEnd },
        },
        select: { createdAt: true, reflection: true, missionCounted: true },
      }),
      readReadingWeeklyMissionClaimed(student.id, missionPeriod.weekStart),
      db.studentSlime.findFirst({
        where: { studentId: student.id, isRepresentative: true },
        select: { color: true, growthStage: true },
      }),
    ]);

  if (!classroom) redirect("/login?from=/student/reading");

  const weeklyMissionReward: ReadingWeeklyMissionReward =
    buildReadingWeeklyMissionReward({
      studentId: student.id,
      weekStart: missionPeriod.weekStart,
      weekEnd: missionPeriod.weekEnd,
      logs: weeklyReadingLogs,
      claimed,
    });
  const initialRepresentativePet =
    representativeSlime &&
    SLIME_COLORS.includes(representativeSlime.color as SlimeColor) &&
    (representativeSlime.growthStage === 1 ||
      representativeSlime.growthStage === 2 ||
      representativeSlime.growthStage === 3)
      ? {
          color: representativeSlime.color as SlimeColor,
          growthStage: representativeSlime.growthStage as 1 | 2 | 3,
        }
      : null;

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={classroom.name}
        duties={duties}
        isAdminClassroom={isAdminEmail(student.classroom.teacher.email)}
      />
      <main className={`student-page student-reading-page ${styles.page}`}>
        <StudentActivityTabs
          activity="reading"
          initialView={initialView}
          records={<ReadingForm />}
          missions={
            <div className="student-reading-missions-content">
              <AttendanceMission attendance={attendance} />
              <WeeklyReadingMission
                initialReward={weeklyMissionReward}
                initialRepresentativePet={initialRepresentativePet}
              />
            </div>
          }
          titles={<ReadingTitles />}
        />
      </main>
    </>
  );
}
