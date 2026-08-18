import { redirect } from "next/navigation";

import { StudentTopNav } from "@/components/StudentTopNav";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentHomePayload } from "@/lib/student-home";
import { isAdminEmail } from "@/lib/admin";

import {
  normalizeActivityView,
  type SelfDirectedSearchParams,
} from "../self-directed/navigation";
import styles from "../self-directed/page.module.css";
import { WalkingDashboard } from "./WalkingDashboard";

export const dynamic = "force-dynamic";

export default async function StudentWalkingPage({
  searchParams,
}: {
  searchParams: Promise<Omit<SelfDirectedSearchParams, "activity">>;
}) {
  const query = await searchParams;
  const initialView = normalizeActivityView("walking", query.tab ?? query.view);
  const student = await getCurrentStudent();

  if (!student) redirect("/login?from=/student/walking");

  const home = await getStudentHomePayload(student);

  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={home.duties}
        isAdminClassroom={isAdminEmail(student.classroom.teacher.email)}
      />
      <main className={`student-page student-walking-page ${styles.page}`}>
        <WalkingDashboard initialView={initialView} />
      </main>
    </>
  );
}
