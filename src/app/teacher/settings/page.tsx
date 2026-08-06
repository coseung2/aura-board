import Link from "next/link";
import { redirect } from "next/navigation";
import { CanvaConnectionCard } from "@/components/CanvaConnectionCard";
import { LlmKeyForm } from "@/components/LlmKeyForm";
import { TopNav } from "@/components/TopNav";
import { SettingsSectionNav } from "@/components/teacher/SettingsSectionNav";
import { TeacherWithdrawalSection } from "@/components/teacher/TeacherWithdrawalSection";
import { getCurrentUser } from "@/lib/auth";
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
      <main className="teacher-settings-page">
        <div className="teacher-settings-shell">
          <header className="teacher-settings-header">
            <Link href="/dashboard" className="teacher-settings-back">
              ← 대시보드
            </Link>
            <p className="teacher-settings-eyebrow">SETTINGS</p>
            <h1>교사 설정</h1>
            <p>외부 서비스 연결과 사용 상태를 한곳에서 관리합니다.</p>
          </header>

          <div className="teacher-settings-layout">
            <SettingsSectionNav />

            <div className="teacher-settings-content">
              <section id="llm" className="settings-flat-section" aria-labelledby="ai-heading">
                <header className="settings-flat-header">
                  <div>
                    <p className="settings-flat-eyebrow">AI</p>
                    <h2 id="ai-heading">생성형 AI</h2>
                  </div>
                  <p>수업 기능에서 사용할 공급자와 API 키를 연결합니다.</p>
                </header>
                <LlmKeyForm />
              </section>

              <section
                id="canva"
                className="settings-flat-section"
                aria-labelledby="canva-heading"
              >
                <header className="settings-flat-header">
                  <div>
                    <p className="settings-flat-eyebrow">CANVA</p>
                    <h2 id="canva-heading">Canva 연결</h2>
                  </div>
                  <p>디자인 가져오기, PDF 내보내기, 폴더 정리에 사용할 계정입니다.</p>
                </header>
                <CanvaConnectionCard initialConnected={canvaConnected} />
              </section>

              <TeacherWithdrawalSection email={user.email} />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
