import { redirect } from "next/navigation";

// parent-redesign (2026-04-26): 자녀 deep-link 진입 시 대시보드로.
// 6탭 통합으로 자녀 단독 페이지 X. /parent/home?child=ID 으로 보존.
export default async function ChildIndexRedirect({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  redirect(`/parent/home?child=${encodeURIComponent(studentId)}`);
}
