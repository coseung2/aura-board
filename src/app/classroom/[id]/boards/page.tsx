import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { availableLayoutKeys } from "@/lib/product-release";
import { notFound } from "next/navigation";
import { ClassroomBoardsTab } from "@/components/classroom/ClassroomBoardsTab";
import { getCurrentTierAsync } from "@/lib/tier";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ create?: string }>;
};

export default async function ClassroomBoardsPage({ params, searchParams }: Props) {
  const [{ id }, { create }] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  const isAdmin = isAdminEmail(user.email);
  const layouts = availableLayoutKeys({ isAdmin });
  const [classroom, tier] = await Promise.all([
    db.classroom.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        teacherId: true,
        _count: { select: { students: true } },
        boards: {
          where: { layout: { in: layouts }, systemGameKind: null },
          select: { id: true, slug: true, title: true, layout: true, createdAt: true, updatedAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    getCurrentTierAsync(user.id),
  ]);
  if (!classroom || classroom.teacherId !== user.id) notFound();

  // 교사가 소유(owner membership) 또는 학급 연결된 모든 보드 — 연결 picker용.
  const allBoardRows = await db.board.findMany({
    where: {
      layout: { in: layouts },
      systemGameKind: null,
      OR: [
        { members: { some: { userId: user.id, role: "owner" } } },
        { classroomId: id },
      ],
    },
    select: { id: true, slug: true, title: true, layout: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
  });

  const linkedBoards = classroom.boards.map((b) => ({
    id: b.id,
    slug: b.slug,
    title: b.title,
    layout: b.layout,
    updatedAt: b.updatedAt.toISOString(),
  }));
  const allBoards = allBoardRows.map((b) => ({
    id: b.id,
    slug: b.slug,
    title: b.title,
    layout: b.layout,
    updatedAt: b.updatedAt.toISOString(),
  }));

  return (
    <main className="classroom-page classroom-page-detail">
      <a href="/classroom" className="classroom-back-link">
        &larr; 학급 목록
      </a>
      <h1 className="classroom-page-title">{classroom.name}</h1>
      <ClassroomBoardsTab
        classroomId={classroom.id}
        classroomName={classroom.name}
        studentCount={classroom._count.students}
        linkedBoards={linkedBoards}
        allBoards={allBoards}
        autoOpenCreate={create === "1"}
        isAdmin={isAdmin}
        userTier={tier}
      />
    </main>
  );
}
