import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LlmKeyForm } from "@/components/LlmKeyForm";
import { TopNav } from "@/components/TopNav";
import { TeacherWithdrawalSection } from "@/components/teacher/TeacherWithdrawalSection";

const ADMIN_EMAIL = "mallagaenge@gmail.com";

export const metadata = {
  title: "교사 설정 · Aura-board",
};

export default async function TeacherSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/teacher/settings");

  return (
    <>
      <TopNav showAdmin={user.email.toLowerCase() === ADMIN_EMAIL} />
      <main className="docs-page">
      <article className="docs-article">
        <Link href="/dashboard" className="docs-back">
          ← 대시보드로
        </Link>
        <h1 className="docs-title">교사 설정</h1>
        <p className="docs-subtitle">
          생성형 AI 연결 상태를 확인하고 관리합니다.
        </p>

        <section id="llm" className="docs-section settings-section">
          <div className="settings-section-header">
            <h2 className="docs-h2">생성형 AI 연결</h2>
            <Link href="/docs/ai-setup" className="docs-link settings-help-link">
              발급 방법 안내 →
            </Link>
          </div>
          <p className="docs-p">
            AI 평어 생성, 추후 개발될 기능에 활용 가능합니다.
          </p>
          <LlmKeyForm />
        </section>
        <TeacherWithdrawalSection />
      </article>
      </main>
    </>
  );
}
