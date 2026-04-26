import { redirect } from "next/navigation";

// parent-redesign (2026-04-26): 6탭 → portfolio 단일 통합. 본 페이지는
// deep-link backwards safety 용 redirect (북마크/이메일 알림 잔존 대비).
export default async function ParentPlantRedirect({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  void studentId;
  redirect("/parent/home");
}
