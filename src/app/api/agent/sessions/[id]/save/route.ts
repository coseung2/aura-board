// Agent Service — POST /api/agent/sessions/[id]/save
// 채팅 내용을 VibeProject로 저장

import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";

const SaveSchema = z.object({
  boardId: z.string().min(1),
  title: z.string().min(1).max(40),
  description: z.string().max(500).default(""),
  tags: z.array(z.string()).default([]),
});

function extractHtmlFromAssistantContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as { code?: unknown; message?: unknown };
    if (typeof parsed.code === "string" && parsed.code.trim()) {
      return parsed.code;
    }
    if (typeof parsed.message === "string") {
      content = parsed.message;
    }
  } catch {
    // Older messages used markdown code fences directly.
  }

  const codeBlocks = content.match(/```html\n?([\s\S]*?)```/);
  return codeBlocks?.[1]?.trim() ?? "";
}

export async function POST(
  req: Request,
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

  // Verify session ownership
  const session = await db.agentSession.findUnique({
    where: { id },
    include: {
      messages: {
        where: { role: "assistant" },
        orderBy: { createdAt: "desc" },
        take: 1,
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

  const body = await req.json().catch(() => null);
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { boardId, title, description, tags } = parsed.data;

  // Extract HTML code from latest assistant message
  const lastMsg = session.messages[0];
  let htmlContent = "";
  let cssContent = "";
  let jsContent = "";

  if (lastMsg) {
    const fullHtml = extractHtmlFromAssistantContent(lastMsg.content);
    if (fullHtml) {
      // Split into html/css/js
      const styleMatch = fullHtml.match(/<style>([\s\S]*?)<\/style>/);
      const scriptMatch = fullHtml.match(/<script>([\s\S]*?)<\/script>/);
      const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      
      cssContent = styleMatch?.[1]?.trim() ?? "";
      jsContent = scriptMatch?.[1]?.trim() ?? "";
      htmlContent = bodyMatch?.[1]?.trim() ?? fullHtml;
    }
  }

  // Create VibeProject
  const project = await db.vibeProject.create({
    data: {
      boardId,
      classroomId: student.classroomId,
      authorStudentId: student.id,
      title,
      description,
      htmlContent: htmlContent || "<p>에이전트 채팅 기록</p>",
      cssContent,
      jsContent,
      tags: JSON.stringify(tags.length > 0 ? tags : ["기타"]),
      moderationStatus: "draft",
    },
  });

  // Link session to project
  await db.agentSession.update({
    where: { id: session.id },
    data: {
      projectId: project.id,
      status: "completed",
    },
  });

  return new Response(
    JSON.stringify({
      projectId: project.id,
      title: project.title,
    }),
    {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }
  );
}
