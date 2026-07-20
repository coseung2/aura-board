import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStudent } from "@/lib/student-auth";
import { hasPermission } from "@/lib/bank-permissions";
import { notFound } from "next/navigation";
import { ClassroomBankTab } from "@/components/classroom/ClassroomBankTab";
import { ClassroomSectionHeader } from "@/components/classroom/ClassroomSectionHeader";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
};

export default async function ClassroomBankPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { view: rawView } = await searchParams;
  const view = rawView === "history" ? "history" : "actions";
  const [user, student] = await Promise.all([
    getCurrentUser().catch(() => null),
    getCurrentStudent().catch(() => null),
  ]);
  const classroom = await db.classroom.findUnique({
    where: { id },
    select: { id: true, name: true, teacherId: true },
  });
  if (!classroom) notFound();

  const isTeacher = user?.id === classroom.teacherId;
  const isBanker =
    !isTeacher && student
      ? await hasPermission(id, { studentId: student.id }, "bank.deposit")
      : false;
  if (!isTeacher && !isBanker) notFound();

  return (
    <main className="classroom-page classroom-page-detail">
      <ClassroomSectionHeader
        classroomId={classroom.id}
        eyebrow={classroom.name}
        title="금융 관리"
        ariaLabel="금융 관리 메뉴"
        activeKey={view}
        backHref="/classroom"
        backLabel="학급 목록"
        links={[
          { key: "actions", label: "입출금", href: `/classroom/${classroom.id}/bank` },
          {
            key: "history",
            label: "거래 기록",
            href: `/classroom/${classroom.id}/bank?view=history`,
          },
        ]}
      />
      <ClassroomBankTab classroomId={classroom.id} view={view} />
    </main>
  );
}
