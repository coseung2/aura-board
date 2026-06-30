import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import { ClassroomBoardsTab } from "@/components/classroom/ClassroomBoardsTab";

type Props = { params: Promise<{ id: string }> };

export default async function ClassroomBoardsPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentUser();
  const classroom = await db.classroom.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      teacherId: true,
      boards: {
        select: { id: true, slug: true, title: true, layout: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!classroom || classroom.teacherId !== user.id) notFound();

  // 교사가 소유(owner membership) 또는 학급 연결된 모든 보드 — 연결 picker용.
  const allBoardRows = await db.board.findMany({
    where: {
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
        linkedBoards={linkedBoards}
        allBoards={allBoards}
      />
    </main>
  );
}
