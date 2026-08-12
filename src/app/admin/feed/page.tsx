import { TopNav } from "@/components/TopNav";
import { AdminFeatureHeader } from "@/components/admin/AdminFeatureHeader";
import { AdminFeedHub } from "@/components/feed/AdminFeedHub";
import { AdminForbidden, requireAdminUser } from "@/lib/admin-auth";

export const metadata = { title: "공식 피드 관리 · Aura-board" };

export default async function AdminFeedPage() {
  const auth = await requireAdminUser("/admin/feed");
  if (!auth.authorized) return <AdminForbidden />;

  return (
    <>
      <TopNav showAdmin />
      <main className="admin-page">
        <AdminFeatureHeader
          eyebrow="콘텐츠 운영"
          description="학생 전체 피드와 교사용 공유 풀에 배포할 Aura 공식 게시물을 작성합니다."
          active="feed"
        />
        <AdminFeedHub />
      </main>
    </>
  );
}
