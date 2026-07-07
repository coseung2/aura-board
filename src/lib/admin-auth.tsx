import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { getCurrentUser } from "@/lib/auth";

export const ADMIN_EMAIL = "mallagaenge@gmail.com";

export async function requireAdminUser(callbackUrl: string) {
  let currentUser;
  try {
    currentUser = await getCurrentUser();
  } catch {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  if (currentUser.email.toLowerCase() !== ADMIN_EMAIL) {
    return { currentUser, authorized: false as const };
  }

  return { currentUser, authorized: true as const };
}

export function AdminForbidden() {
  return (
    <>
      <TopNav />
      <main className="admin-page">
        <section className="admin-forbidden">
          <p className="admin-eyebrow">관리자</p>
          <h1>접근 권한이 없습니다</h1>
          <p>이 페이지는 지정된 관리자 계정만 볼 수 있습니다.</p>
          <Link href="/dashboard" className="admin-link-btn">
            대시보드로 이동
          </Link>
        </section>
      </main>
    </>
  );
}
