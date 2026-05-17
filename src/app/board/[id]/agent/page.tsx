import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { AgentPageClient } from "@/components/agent/AgentPageClient";

export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const student = await getCurrentStudent();
  if (!student) redirect(`/board/${id}`);

  const board = await db.board.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true, classroomId: true, layout: true, title: true },
  });
  if (!board) notFound();
  if (!board.classroomId || board.classroomId !== student.classroomId) {
    redirect(`/board/${id}`);
  }
  // Allow agent on any board layout (not just vibe-arcade)

  // Fetch student's previous sessions
  const recentSessions = await db.agentSession.findMany({
    where: { studentId: student.id, status: "active" },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      mode: true,
      title: true,
      status: true,
      messageCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return (
    <AgentPageClient
      boardId={board.id}
      boardTitle={board.title}
      boardHref={`/board/${id}`}
      studentId={student.id}
      studentName={student.name}
      recentSessions={recentSessions.map((s) => ({
        id: s.id,
        mode: s.mode,
        title: s.title,
        status: s.status,
        messageCount: s.messageCount,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }))}
    />
  );
}
