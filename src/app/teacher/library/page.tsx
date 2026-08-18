import { redirect } from "next/navigation";

import { TopNav } from "@/components/TopNav";
import { TeacherLibraryWorkspace } from "@/components/teacher-library/TeacherLibraryWorkspace";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { isCanvaConnected } from "@/lib/canva";
import { getTeacherLibrary } from "@/lib/teacher-library";

export const dynamic = "force-dynamic";
export const metadata = { title: "내 라이브러리 · Aura-board" };

export default async function TeacherLibraryPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login?from=/teacher/library");
  const [payload, canvaConnected] = await Promise.all([
    getTeacherLibrary(user.id),
    isCanvaConnected(user.id),
  ]);

  return (
    <>
      <TopNav showAdmin={isAdminEmail(user.email)} />
      <TeacherLibraryWorkspace
        initialPayload={payload}
        initialCanvaConnected={canvaConnected}
      />
    </>
  );
}
