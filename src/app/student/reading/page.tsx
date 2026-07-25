import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { StudentTopNav } from "@/components/StudentTopNav";
import { getStudentMonthlyAttendance } from "@/lib/student-attendance";
import {
  buildReadingWeeklyMissionReward,
  type ReadingWeeklyMissionReward,
} from "@/lib/reading-missions";
import {
  getKstClassroomWalkingRankPeriods,
  READING_WEEKLY_MISSION_REWARD_SOURCE_TYPE,
  readingWeeklyMissionSourceRef,
} from "@/lib/reward-policy";
import { StudentActivityTabs } from "@/components/student/StudentActivityTabs";
import { AttendanceMission } from "@/components/student/AttendanceMission";
import { WeeklyReadingMission } from "@/components/student/WeeklyReadingMission";
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

// 학생 독서 기록 페이지. 학생 본인 화면 상단 내비게이션의 독서 탭에서 진입.
export default async function StudentReadingPage() {
  const student = await getCurrentStudent();
  if (!student) {
    redirect("/login?from=/student/reading");
  }
  const missionPeriod = getKstClassroomWalkingRankPeriods().active;
  const missionWeekStart = new Date(`${missionPeriod.weekStart}T00:00:00+09:00`);
  const missionWeekEnd = new Date(`${missionPeriod.weekEnd}T00:00:00+09:00`);
  const [classroom, duties, attendance, weeklyReadingLogs, claimed] = await Promise.all([
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
  if (!classroom) {
    redirect("/login?from=/student/reading");
  }
  const weeklyMissionReward: ReadingWeeklyMissionReward = buildReadingWeeklyMissionReward({
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
      <main className="student-page student-reading-page">
        <StudentActivityTabs
          activity="reading"
          records={<ReadingForm />}
          missions={
            <div className="student-reading-missions-content">
              <AttendanceMission studentId={student.id} attendance={attendance} />
              <WeeklyReadingMission initialReward={weeklyMissionReward} />
            </div>
          }
        />
      </main>
    </>
  );
}
