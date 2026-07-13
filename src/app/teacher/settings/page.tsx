import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LlmKeyForm } from "@/components/LlmKeyForm";
import { TopNav } from "@/components/TopNav";
import { TeacherWithdrawalSection } from "@/components/teacher/TeacherWithdrawalSection";
import { CanvaConnectionCard } from "@/components/CanvaConnectionCard";
import { isCanvaConnected } from "@/lib/canva";

const ADMIN_EMAIL = "mallagaenge@gmail.com";

export const metadata = {
  title: "교사 설정 · Aura-board",
};

export default async function TeacherSettingsPage() {
  const user = await getCurrentUser().catch(() => null);
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
        <section id="canva" className="docs-section settings-section">
          <div className="settings-section-header">
            <h2 className="docs-h2">Canva 계정 연결</h2>
          </div>
          <p className="docs-p">
            Canva 디자인 가져오기, PDF 내보내기, 폴더 정리에 사용하는 계정을 관리합니다.
          </p>
          <CanvaConnectionCard actor="teacher" initialConnected={canvaConnected} />
        </section>
        <TeacherWithdrawalSection email={user.email} />
      </article>
      </main>
    </>
  );
}
