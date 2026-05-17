// Agent Service — GET /api/agent/sessions/[id]
// 세션 상세 + 메시지 목록 반환

import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import type { AgentSessionDTO, AgentMessageDTO, AgentMode } from "@/lib/agent/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const student = await getCurrentStudent();
  if (!student) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = await params;

  const session = await db.agentSession.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!session) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (session.studentId !== student.id) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const dto: AgentSessionDTO = {
    id: session.id,
    mode: session.mode as AgentMode,
    title: session.title,
    status: session.status as AgentSessionDTO["status"],
    tokenCount: session.tokenCount,
    messageCount: session.messageCount,
    projectId: session.projectId,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messages: session.messages.map((m: { id: string; role: string; content: string; tokenCount: number | null; createdAt: Date }) => ({
      id: m.id,
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      tokenCount: m.tokenCount,
      createdAt: m.createdAt.toISOString(),
    })),
  };

  return new Response(JSON.stringify(dto), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
