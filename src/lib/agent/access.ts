import "server-only";
import { isAdminEmail } from "../admin";
import { getCurrentStudent } from "../student-auth";

/** Experimental Agent sessions are restricted to administrator classrooms. */
export async function getCurrentAgentStudent() {
  const student = await getCurrentStudent();
  return student && isAdminEmail(student.classroom.teacher.email) ? student : null;
}
