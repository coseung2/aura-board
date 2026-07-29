import { redirect } from "next/navigation";

import { AttendanceMission } from "@/components/student/AttendanceMission";
import { ReadingTitles } from "@/components/student/ReadingTitles";
import { StudentActivityTabs } from "@/components/student/StudentActivityTabs";
import { StudentTopNav } from "@/components/StudentTopNav";
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
import { getStudentDuties } from "@/lib/role-portals";
import { getStudentMonthlyAttendance } from "@/lib/student-attendance";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentHomePayload } from "@/lib/student-home";

import { ReadingForm } from "../reading/ReadingForm";
import { WalkingDashboard } from "../walking/WalkingDashboard";
import {
  normalizeActivityView,
  normalizeSelfDirectedActivity,
  type SelfDirectedSearchParams,
} from "./navigation";
import styles from "./page.module.css";
import { SelfDirectedSectionTabs } from "./SelfDirectedSectionTabs";
import { WeeklyReadingMission } from "@/components/student/WeeklyReadingMission";

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

export default async function StudentSelfDirectedPage({
  searchParams,
}: {
  searchParams: Promise<SelfDirectedSearchParams>;
}) {
  const query = await searchParams;
  const activity = normalizeSelfDirectedActivity(query.activity);
  const initialView = normalizeActivityView(activity, query.tab ?? query.view);
  const student = await getCurrentStudent();

  if (!student) redirect("/login?from=/student/self-directed");

  if (activity === "walking") {
    const home = await getStudentHomePayload(student);
    return (
      <>
        <StudentTopNav
          studentName={student.name}
          classroomName={student.classroom.name}
          duties={home.duties}
        />
        <main className={`student-page student-walking-page ${styles.page}`}>
          <header className={styles.pageHeader}>
            <h1 className={styles.title}>자율활동</h1>
          </header>
          <SelfDirectedSectionTabs active={activity} />
          <WalkingDashboard initialView={initialView} />
        </main>
      </>
    );
  }

  const missionPeriod = getKstClassroomWalkingRankPeriods().active;
  const missionWeekStart = new Date(`${missionPeriod.weekStart}T00:00:00+09:00`);
  const missionWeekEnd = new Date(`${missionPeriod.weekEnd}T00:00:00+09:00`);
  const [classroom, duties, attendance, weeklyReadingLogs, claimed] =
    await Promise.all([
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
        select: { createdAt: true, reflection: true },
      }),
      readReadingWeeklyMissionClaimed(student.id, missionPeriod.weekStart),
    ]);

  if (!classroom) redirect("/login?from=/student/self-directed");

  const weeklyMissionReward: ReadingWeeklyMissionReward =
    buildReadingWeeklyMissionReward({
      studentId: student.id,
      weekStart: missionPeriod.weekStart,
      weekEnd: missionPeriod.weekEnd,
      logs: weeklyReadingLogs,
      claimed,
    });

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={classroom.name}
        duties={duties}
      />
      <main className={`student-page student-reading-page ${styles.page}`}>
        <header className={styles.pageHeader}>
          <h1 className={styles.title}>자율활동</h1>
        </header>
        <SelfDirectedSectionTabs active={activity} />
        <StudentActivityTabs
          activity="reading"
          initialView={initialView}
          records={<ReadingForm />}
          missions={
            <div className="student-reading-missions-content">
              <AttendanceMission studentId={student.id} attendance={attendance} />
              <WeeklyReadingMission initialReward={weeklyMissionReward} />
            </div>
          }
          titles={<ReadingTitles />}
        />
      </main>
    </>
  );
}
