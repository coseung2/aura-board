import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { DEFAULT_AGENT_SYSTEM_PROMPT, streamDeepSeek } from "@/lib/agent/stream-deepseek";
import { AGENT_MODES, type AgentMode } from "@/lib/agent/types";
import { decryptApiKey } from "@/lib/llm/encryption";

const SendSchema = z.object({
  content: z.string().min(1).max(4000),
});

const MODE_PROMPTS: Record<AgentMode, string> = {
  arcade:
    "모드: 게임. 학생이 바로 실행할 수 있는 단일 HTML 게임을 만들어 주세요. 코드는 JSON의 code 필드에 전체 HTML로 넣으세요.",
  tutor:
    "모드: 학습. 학생의 질문에 쉽게 설명하고, 필요하면 짧은 예시와 연습 문제를 제안하세요.",
  code:
    "모드: 코딩. 코드 작성, 리뷰, 디버깅을 돕고 필요하면 실행 가능한 단일 HTML 예시를 code 필드에 넣으세요.",
  lesson:
    "모드: 수업. 선생님이 준비한 수업 자료를 학생이 따라갈 수 있도록 차근차근 안내하세요.",
};

async function getTeacherApiKey(classroomId: string): Promise<string | null> {
  try {
    const classroom = await db.classroom.findUnique({
      where: { id: classroomId },
      select: { teacherId: true },
    });
    if (!classroom) return null;

    const llmKey = await db.teacherLlmKey.findUnique({
      where: { userId: classroom.teacherId },
    });
    if (!llmKey?.apiKeyEnc) return null;

    return decryptApiKey(llmKey.apiKeyEnc);
  } catch {
    return null;
  }
}

function extractAgentJsonParts(jsonText: string) {
  try {
    const parsed = JSON.parse(jsonText) as { message?: unknown; code?: unknown };
    return {
      message: typeof parsed.message === "string" ? parsed.message : "",
      code: typeof parsed.code === "string" ? parsed.code : "",
    };
  } catch {
    return { message: "", code: "" };
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const student = await getCurrentStudent();
  if (!student) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const session = await db.agentSession.findUnique({ where: { id } });
  if (!session) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (session.studentId !== student.id) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const { content } = parsed.data;
  const mode = AGENT_MODES.includes(session.mode as AgentMode)
    ? (session.mode as AgentMode)
    : "arcade";
  const systemPrompt = `${DEFAULT_AGENT_SYSTEM_PROMPT}\n\n${MODE_PROMPTS[mode]}`;

  await db.agentMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content,
    },
  });

  const apiKey = await getTeacherApiKey(session.classroomId);
  const priorMessages = await db.agentMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });

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
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // The browser may close the stream before the provider finishes.
        }
      };

      send({ type: "session", id: session.id });

      let fullContent = "";
      let totalTokensIn = 0;
      let totalTokensOut = 0;

      try {
        const result = await streamDeepSeek({
          apiKey: apiKey ?? "",
          systemPrompt,
          messages: priorMessages.map((message) => ({
            role: message.role as "user" | "assistant",
            content: message.content,
          })),
          onDelta: (text) => {
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

        const sourceContent = fullContent || result.content;
        const extractedParts = extractAgentJsonParts(sourceContent);
        const finalParts =
          !extractedParts.message && !extractedParts.code && sourceContent
            ? { message: sourceContent, code: "" }
            : extractedParts;

        await db.agentMessage.create({
          data: {
            sessionId: session.id,
            role: "assistant",
            content: JSON.stringify(finalParts),
            tokenCount: totalTokensOut,
          },
        });

        await db.agentSession.update({
          where: { id: session.id },
          data: {
            tokenCount: { increment: totalTokensIn + totalTokensOut },
            messageCount: priorMessages.length + 1,
            title: session.title || (priorMessages.length <= 1 ? content.slice(0, 60) : undefined),
          },
        });

        send({
          type: "done",
          stopReason: result.stopReason,
          tokensIn: totalTokensIn,
          tokensOut: totalTokensOut,
          message: finalParts.message,
          code: finalParts.code,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        send({ type: "error", message });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
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
