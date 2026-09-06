import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentAgentStudent as getCurrentStudent } from "@/lib/agent/access";
import { StudioClient } from "@/components/vibe-arcade/StudioClient";

export default async function VibeArcadeStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const student = await getCurrentStudent();
  if (!student) redirect(`/board/${id}`);

  const board = await db.board.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true, classroomId: true, layout: true },
  });
  if (!board || board.layout !== "vibe-arcade") notFound();
  if (!board.classroomId || board.classroomId !== student.classroomId) {
    redirect(`/board/${id}`);
  }

  const cfg = await db.vibeArcadeConfig.findUnique({
    where: { boardId: board.id },
    select: { enabled: true },
  });
  if (!cfg?.enabled) redirect(`/board/${id}`);

  const project = await db.vibeProject.findFirst({
    where: { boardId: board.id, authorStudentId: student.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      moderationStatus: true,
      moderationNote: true,
    },
  });

  return (
    <StudioClient
      boardId={board.id}
      boardHref={`/board/${id}`}
      studentId={student.id}
      studentName={student.name}
      existingProject={
        project
          ? {
              id: project.id,
              title: project.title,
              moderationStatus: project.moderationStatus,
              moderationNote: project.moderationNote,
            }
          : null
      }
    />
  );
}
