import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { redirect } from "next/navigation";
import { WalletHome } from "@/components/wallet/WalletHome";
import { StudentTopNav } from "@/components/StudentTopNav";
import { getStudentTopNavBoards } from "@/lib/top-nav-data";

export default async function MyWalletPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/student/login");
  const [duties, topNavBoards] = await Promise.all([
    getStudentDuties(student.id),
    getStudentTopNavBoards(student.classroomId),
  ]);
  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
        boards={topNavBoards}
      />
      <main className="wallet-page">
        <WalletHome />
      </main>
    </>
  );
}
