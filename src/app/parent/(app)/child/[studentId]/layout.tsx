import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireParentScopeForStudent, ParentScopeError } from "@/lib/parent-scope";

// PV-7 child shell. Every page under /parent/child/[studentId]/** re-verifies
// studentId ∈ parent.children server-side before rendering.
//
// parent-redesign (2026-04-26): ChildTabs + 아바타 헤더 제거. 자녀 단독
// 페이지는 portfolio 만 남고, 그마저 redirect 가능 (대시보드가 자녀 셀렉터로
// 통합). 레이아웃은 권한 가드만 유지 — 본문 헤더는 각 page 가 own.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ChildLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const reqStub = new Request("https://internal.local/parent-scope");
  try {
    await requireParentScopeForStudent(reqStub, studentId);
  } catch (e) {
    if (e instanceof ParentScopeError) {
      if (e.status === 401) redirect("/parent/logged-out");
      redirect("/parent/home?error=forbidden_student");
    }
    throw e;
  }
  return <>{children}</>;
}
