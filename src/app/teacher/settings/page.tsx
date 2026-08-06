import { redirect } from "next/navigation";
import { CanvaConnectionCard } from "@/components/CanvaConnectionCard";
import { LlmKeyForm } from "@/components/LlmKeyForm";
import { TopNav } from "@/components/TopNav";
import { SettingsContentTabs } from "@/components/teacher/SettingsContentTabs";
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
          <SettingsContentTabs
            ai={<LlmKeyForm />}
            integrations={
              <div className="ai-settings-stack">
                <section
                  className="ai-settings-group"
                  aria-labelledby="canva-heading"
                >
                  <div className="ai-settings-group-head ai-provider-table-head">
                    <div>
                      <h3 id="canva-heading">Canva 연결</h3>
                    </div>
                    <div className="ai-provider-table-labels" aria-hidden="true">
                      <span>권한 및 스코프</span>
                      <span>관리</span>
                    </div>
                  </div>
                  <div className="ai-settings-group-body">
                    <CanvaConnectionCard initialConnected={canvaConnected} />
                  </div>
                </section>
                <TeacherWithdrawalSection email={user.email} initialName={user.name ?? ""} />
              </div>
            }
          />
        </div>
      </main>
    </>
  );
}
