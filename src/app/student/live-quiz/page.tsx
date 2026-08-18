import { redirect } from "next/navigation";

import { LiveQuizExperience } from "@/components/live-quiz/LiveQuizExperience";
import { StudentTopNav } from "@/components/StudentTopNav";
import { getStudentDuties } from "@/lib/role-portals";
import { getCurrentStudent } from "@/lib/student-auth";
import { isAdminEmail } from "@/lib/admin";

export const metadata = {
  title: "오늘의 라이브 퀴즈 · Aura-board",
};

export const dynamic = "force-dynamic";

export default async function StudentLiveQuizPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/live-quiz");

  const duties = await getStudentDuties(student.id);
  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
        isAdminClassroom={isAdminEmail(student.classroom.teacher.email)}
      />
      <LiveQuizExperience viewerKind="student" displayName={student.name} />
    </>
  );
}
