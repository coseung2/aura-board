import { TopNav } from "@/components/TopNav";
import { AdminFeatureHeader } from "@/components/admin/AdminFeatureHeader";
import { AdminForbidden, requireAdminUser } from "@/lib/admin-auth";
import { AdminUsageDashboard } from "@/components/admin/AdminUsageDashboard";

export const metadata = { title: "사용량 분석 · 관리자 · Aura-board" };

export default async function AdminUsagePage() {
  const auth = await requireAdminUser("/admin/usage");
  if (!auth.authorized) return <AdminForbidden />;
  return (
    <>
      <TopNav showAdmin />
      <main className="admin-page">
        <AdminFeatureHeader
          eyebrow="사용량 분석"
          active="usage"
          description="기간별 활성 사용자와 기능별 활용량을 확인합니다."
        />
        <AdminUsageDashboard />
      </main>
    </>
  );
}
