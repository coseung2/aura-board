import { redirect } from "next/navigation";

import { StudentTopNav } from "@/components/StudentTopNav";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentHomePayload } from "@/lib/student-home";

import { WalkingDashboard } from "./WalkingDashboard";

export default async function StudentWalkingPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/student/walking");

  const home = await getStudentHomePayload(student);

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={home.duties}
      />
      <main className="student-page student-walking-page">
        <WalkingDashboard />
      </main>
    </>
  );
}
