import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ClassroomListPage } from "@/components/ClassroomListPage";
import { TopNav } from "@/components/TopNav";
import { redirect } from "next/navigation";

const ADMIN_EMAIL = "mallagaenge@gmail.com";

export default async function ClassroomPage() {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    redirect("/login");
  }

  const classrooms = await db.classroom.findMany({
    where: { teacherId: user.id },
    include: {
      _count: { select: { students: true, boards: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <TopNav showAdmin={user.email.toLowerCase() === ADMIN_EMAIL} />
      <main className="classroom-page">
        <div className="classroom-header">
          <h1>학급 관리</h1>
        </div>
        <ClassroomListPage initialClassrooms={classrooms} />
      </main>
    </>
  );
}
