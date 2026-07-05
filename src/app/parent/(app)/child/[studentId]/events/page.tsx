import { redirect } from "next/navigation";

// parent-redesign (2026-04-26): 6탭 → portfolio 단일 통합. 본 페이지는
// deep-link backwards safety 용 redirect (북마크/이메일 알림 잔존 대비).
// 자녀 컨텍스트는 /parent/home?child=<id> 로 그대로 전달 — selector 칩이
// 해당 자녀를 자동 선택하도록.
export default async function ParentEventsRedirect({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  redirect(`/parent/home?child=${encodeURIComponent(studentId)}`);
}
