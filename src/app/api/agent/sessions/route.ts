// Agent Service — POST (create session) + GET (list sessions)
// Phase 0: 학생 전용 채팅 세션. 기존 vibe-arcade와 별개.

import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import type { AgentSessionDTO, AgentMode } from "@/lib/agent/types";
import { AGENT_MODES } from "@/lib/agent/types";

const CreateSchema = z.object({
  boardId: z.string().min(1),
  mode: z.enum(AGENT_MODES).default("arcade"),
});

export async function POST(req: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "bad_request", detail: parsed.error.flatten() }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { boardId, mode } = parsed.data;

  // Check board exists and is vibe-arcade type
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: { layout: true, classroomId: true },
  });
  if (!board) {
    return new Response(JSON.stringify({ error: "board_not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (board.classroomId !== student.classroomId) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create session
  const session = await db.agentSession.create({
    data: {
      studentId: student.id,
      classroomId: student.classroomId,
      mode,
      title: "",
      status: "active",
    },
  });

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
  };

  return new Response(JSON.stringify(dto), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit")) || 50), 100);
  const status = searchParams.get("status"); // optional filter

  const where: Record<string, unknown> = { studentId: student.id };
  if (status && ["active", "completed", "abandoned"].includes(status)) {
    where.status = status;
  }

  const sessions = await db.agentSession.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const dtos: AgentSessionDTO[] = sessions.map((s: { id: string; mode: string; title: string; status: string; tokenCount: number; messageCount: number; projectId: string | null; createdAt: Date; updatedAt: Date }) => ({
    id: s.id,
    mode: s.mode as AgentMode,
    title: s.title,
    status: s.status as AgentSessionDTO["status"],
    tokenCount: s.tokenCount,
    messageCount: s.messageCount,
    projectId: s.projectId,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  return new Response(JSON.stringify(dtos), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
