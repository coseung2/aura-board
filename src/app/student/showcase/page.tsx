import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { getStudentDuties } from "@/lib/role-portals";
import { ShowcaseGalleryView } from "@/components/portfolio/ShowcaseGalleryView";
import { StudentTopNav } from "@/components/StudentTopNav";

export const dynamic = "force-dynamic";

// student-portfolio (2026-04-26): 학급 자랑해요 전용 페이지.
// 학생 메인(/student)의 strip 은 최신 10개 가로 스크롤 요약 — 더 보기
// 클릭 시 이 페이지로 진입해 모든 자랑해요를 그리드로 본다.
export default async function StudentShowcasePage() {
  const student = await getCurrentStudent();
  if (!student) {
    redirect("/login?from=/student/showcase");
  }
  const [classroom, duties] = await Promise.all([
    db.classroom.findUnique({
      where: { id: student.classroomId },
      select: { id: true, name: true },
    }),
    getStudentDuties(student.id),
  ]);
  if (!classroom) {
    redirect("/login?from=/student/showcase");
  }
  return (
    <>
      <StudentTopNav
        studentName={student.name}
        classroomName={classroom.name}
        duties={duties}
      />
      <main className="student-page-portfolio-shell">
        <ShowcaseGalleryView
          classroomId={classroom.id}
          classroomName={classroom.name}
        />
      </main>
    </>
  );
}
