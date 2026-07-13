import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { isAdminEmail } from "@/lib/admin";
import { redirect } from "next/navigation";
import { WalletHome } from "@/components/wallet/WalletHome";
import { StudentTopNav } from "@/components/StudentTopNav";
import { isStudentCanvaConnected } from "@/lib/canva";

export default async function MyWalletPage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?from=/my/wallet");
  const duties = await getStudentDuties(student.id);
  const canvaConnected = await isStudentCanvaConnected(student.id);
  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={student.classroom.name}
        duties={duties}
        showDevFeatures={isAdminEmail(student.classroom.teacher.email)}
      />
      <main className="wallet-page">
        <WalletHome canvaConnected={canvaConnected} />
      </main>
    </>
  );
}
