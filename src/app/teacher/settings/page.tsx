import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LlmKeyForm } from "@/components/LlmKeyForm";
import { TopNav } from "@/components/TopNav";
import { TeacherWithdrawalSection } from "@/components/teacher/TeacherWithdrawalSection";
import { isCanvaConnected } from "@/lib/canva";
import { CanvaSettingsSection } from "@/components/teacher/CanvaSettingsSection";

const ADMIN_EMAIL = "mallagaenge@gmail.com";

export const metadata = {
  title: "교사 설정 · Aura-board",
};

export default async function TeacherSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/teacher/settings");
  const canvaConnected = await isCanvaConnected(user.id);

  return (
    <>
      <TopNav showAdmin={user.email.toLowerCase() === ADMIN_EMAIL} />
      <main className="docs-page">
      <article className="docs-article">
        <Link href="/dashboard" className="docs-back">
          ← 대시보드로
        </Link>
        <h1 className="docs-title">교사 설정</h1>

        <section id="llm" className="docs-section settings-section">
          <div className="settings-section-header">
            <h2 className="docs-h2">생성형 AI 연결</h2>
          </div>
          <LlmKeyForm />
        </section>
        <CanvaSettingsSection initialConnected={canvaConnected} />
        <TeacherWithdrawalSection email={user.email} />
      </article>
      </main>
    </>
  );
}
