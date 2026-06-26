import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { TeacherMatrixView } from "@/components/plant/TeacherMatrixView";

export default async function PlantMatrixPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [classroom, user] = await Promise.all([
    db.classroom.findUnique({ where: { id } }),
    getCurrentUser().catch(() => null),
  ]);
  if (!classroom) notFound();

  const canAccess = !!user?.id && classroom.teacherId === user.id;

  // Find the classroom's plant-roadmap board for student journal links
  const board = canAccess
    ? await db.board.findFirst({
        where: { classroomId: id, layout: "plant-roadmap" },
        select: { id: true },
      })
    : null;

  return (
    <main className="board-page">
      <header className="board-header">
        <div className="board-header-left">
          <Link
            href={`/classroom/${id}`}
            className="board-back-link"
            aria-label="학급으로"
          >
            ←
          </Link>
          <h1 className="board-title">매트릭스 뷰 - {classroom.name}</h1>
        </div>
      </header>
      {canAccess ? (
        <TeacherMatrixView classroomId={id} boardId={board?.id} />
      ) : (
        <div className="plant-matrix-forbidden">
          <h3>접근 권한이 없어요</h3>
          <p style={{ color: "var(--color-text-muted)" }}>
            이 학급의 담임 계정으로 로그인해 주세요.
          </p>
        </div>
      )}
    </main>
  );
}
