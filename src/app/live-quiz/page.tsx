import { redirect } from "next/navigation";

import { LiveQuizExperience } from "@/components/live-quiz/LiveQuizExperience";
import { TopNav } from "@/components/TopNav";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "오늘의 라이브 퀴즈 · Aura-board",
};

export const dynamic = "force-dynamic";

export default async function LiveQuizPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect("/login?callbackUrl=/live-quiz");

  const isAdmin = isAdminEmail(user.email);
  return (
    <>
      <TopNav showAdmin={isAdmin} />
      <LiveQuizExperience
        viewerKind="teacher"
        displayName={user.name?.trim() || user.email}
        adminHref={isAdmin ? "/admin/live-quiz" : undefined}
      />
    </>
  );
}
