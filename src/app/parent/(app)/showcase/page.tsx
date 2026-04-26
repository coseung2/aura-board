import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentParent } from "@/lib/parent-session";
import { ShowcaseGalleryView } from "@/components/portfolio/ShowcaseGalleryView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// parent-redesign (2026-04-26): 학부모용 자랑해요 전용 페이지.
// 자녀가 속한 학급(들)의 자랑해요 그리드 — /student/showcase 와 동등.
// 자녀 ≥2명이고 학급이 다르면 ?classroom=ID 로 분기, 미설정 시 첫 자녀의
// 학급 사용. ShowcaseGalleryView 가 학급 단위 fetch (canViewClassroomShowcase
// 가드를 portfolio-acl 이 자녀 학급 검증).
export default async function ParentShowcasePage({
  searchParams,
}: {
  searchParams: Promise<{ classroom?: string }>;
}) {
  const current = await getCurrentParent();
  if (!current) redirect("/parent/join?error=session_required");
  const parent = current.parent;

  const links = await db.parentChildLink.findMany({
    where: { parentId: parent.id, status: "active", deletedAt: null },
    include: {
      student: {
        select: {
          id: true,
          classroomId: true,
          classroom: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  if (links.length === 0) redirect("/parent/home");

  const { classroom: queryClassroomId } = await searchParams;
  const classroomIds = Array.from(
    new Set(links.map((l) => l.student.classroomId))
  );
  const targetClassroomId =
    queryClassroomId && classroomIds.includes(queryClassroomId)
      ? queryClassroomId
      : classroomIds[0];
  const classroomName =
    links.find((l) => l.student.classroomId === targetClassroomId)?.student
      .classroom.name ?? "";

  return (
    <main className="student-page-portfolio-shell">
      <ShowcaseGalleryView
        classroomId={targetClassroomId}
        classroomName={classroomName}
        backHref="/parent/home"
        backLabel="대시보드로"
      />
    </main>
  );
}
