import { redirect } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { TeacherFeedHub } from "@/components/feed/TeacherFeedHub";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = {
  title: "학급 피드 · Aura-board",
};

export default async function TeacherFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login?callbackUrl=/teacher/feed");

  const [{ view }, classrooms] = await Promise.all([
    searchParams,
    db.classroom.findMany({
      where: { teacherId: user.id },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const initialView = view === "global" ? "global" : view === "pool" ? "pool" : "classroom";

  return (
    <>
      <TopNav showAdmin={isAdminEmail(user.email)} />
      <main className="ab-feed-page">
        <TeacherFeedHub classrooms={classrooms} initialView={initialView} />
      </main>
    </>
  );
}
