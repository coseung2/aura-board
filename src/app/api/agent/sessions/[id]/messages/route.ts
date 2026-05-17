// Agent Service — POST /api/agent/sessions/[id]/messages
// 사용자 메시지 전송 → DeepSeek Flash SSE 스트리밍

import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import {
  streamDeepSeek,
  DEFAULT_AGENT_SYSTEM_PROMPT,
} from "@/lib/agent/stream-deepseek";
import { AGENT_MODES, type AgentMode } from "@/lib/agent/types";

const SendSchema = z.object({
  content: z.string().min(1).max(4000),
});

// 모드별 시스템 프롬프트 확장
const MODE_PROMPTS: Record<AgentMode, string> = {
  arcade: `## 모드: 게임 (Arcade)\n학생이 만들고 싶은 게임을 HTML/CSS/JS 코드로 작성해주세요.\n코드는 \\`\\`\\`html 블록으로 감싸서 출력하세요.\n학생이 수정을 요청하면 전체 코드를 다시 출력하세요.`,
  tutor: `## 모드: 학습 (Tutor)\n학생의 학습 질문에 답변합니다. 개념을 쉽게 설명하고,\n필요하면 예제나 연습문제를 제시하세요.\n코드가 필요하면 \\`\\`\\`html 블록으로 출력하세요.`,
  code: `## 모드: 코딩 (Code)\n학생의 코딩 질문에 답변합니다. 코드 리뷰, 디버깅, 최적화를 도와주세요.\n코드 예제는 \\`\\`\\`html 블록으로 출력하세요.`,
  lesson: `## 모드: 수업 (Lesson)\n수업 내용을 따라갈 수 있도록 안내합니다.\n선생님이 준비한 수업 자료를 바탕으로 도와주세요.`,
};

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

  // Find session
  const session = await db.agentSession.findUnique({ where: { id } });
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
  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { content } = parsed.data;
  const mode = session.mode as AgentMode;
  const modePrompt = MODE_PROMPTS[mode] ?? "";
  const systemPrompt = `${DEFAULT_AGENT_SYSTEM_PROMPT}\n\n${modePrompt}`;

  // Save user message
  await db.agentMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content,
    },
  });

  // Build message history
  const priorMessages = await db.agentMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });

  // SSE response
  const encoder = new TextEncoder();
  let aborted = false;
  req.signal.addEventListener("abort", () => {
    aborted = true;
  });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        if (aborted) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
          );
        } catch {
          // ignore after close
        }
      };

      send({ type: "session", id: session.id });

      let fullContent = "";
      let totalTokensIn = 0;
      let totalTokensOut = 0;

      try {
        const result = await streamDeepSeek({
          systemPrompt,
          messages: priorMessages.map((m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          onDelta: (text: string) => {
            fullContent += text;
            send({ type: "delta", text });
          },
          signal: req.signal,
        });

        totalTokensIn = result.tokensIn;
        totalTokensOut = result.tokensOut;

        if (result.stopReason === "error" && !fullContent) {
          send({ type: "error", message: result.content });
        }

        // Save assistant message
        await db.agentMessage.create({
          data: {
            sessionId: session.id,
            role: "assistant",
            content: fullContent || result.content,
            tokenCount: totalTokensOut,
          },
        });

        // Update session
        const msgCount = priorMessages.length + 2; // user + assistant
        await db.agentSession.update({
          where: { id: session.id },
          data: {
            tokenCount: { increment: totalTokensIn + totalTokensOut },
            messageCount: msgCount,
            // Auto-generate title from first exchange
            title:
              session.title || (priorMessages.length <= 2
                ? content.slice(0, 60)
                : undefined),
          },
        });

        send({
          type: "done",
          stopReason: result.stopReason,
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: msg });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
