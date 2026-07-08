// Vibe-arcade session streaming (Seed 13, AC-F3 / AC-F8 / AC-F9 / AC-N5).
// POST: student starts (or continues) a coding session. SSE stream.
//
// Teacher API Key resolution (2026-04-22): 교사가 /teacher/settings#llm에 저장한
// 암호화된 TeacherLlmKey를 board → classroom.teacherId로 풀어서 사용.
// 학생 클라이언트로는 Key 원문이 절대 내려가지 않는다.

import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentStudent } from "@/lib/student-auth";
import { checkQuotaOrReject } from "@/lib/vibe-arcade/quota-ledger";
import { streamLlm, DEFAULT_SYSTEM_PROMPT } from "@/lib/llm/stream";
import { getTeacherKeyForBoard } from "@/lib/llm/teacher-key";
import { limitVibeSession } from "@/lib/rate-limit-routes";
import { CATEGORY_PROMPTS } from "@/lib/vibe-arcade/category-prompts";

const StartSchema = z.object({
  boardId: z.string().min(1),
  // 클라(VibeStudio) 가 첫 요청에 sessionId: null 을 보내는데 단순
  // .optional() 는 null 을 거부해 400. null + undefined 모두 허용.
  sessionId: z.string().nullable().optional(),
  userMessage: z.string().min(1).max(4000),
  // 학생이 시작 화면에서 고른 분야. 해당 프롬프트로 AI 를 인터뷰 모드로
  // 전환. 없으면 (직접 입력 선택) 기본 프롬프트.
  category: z.enum(["game", "quiz", "art", "sim"]).nullable().optional(),
});

export async function POST(req: Request) {
  const student = await getCurrentStudent();
  if (!student) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 학생 1인 프롬프트 호출 레이트리밋 (AI quota와 별개 — 서버 부하·악용 방지).
  const rl = await limitVibeSession(student.id);
  if (!rl.ok) {
    return new Response(
      JSON.stringify({ error: "rate_limited", retryAfter: rl.retryAfter }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rl.retryAfter),
        },
      },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = StartSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { boardId, sessionId, userMessage, category } = parsed.data;

  const cfg = await db.vibeArcadeConfig.findUnique({ where: { boardId } });
  if (!cfg?.enabled) {
    return new Response(JSON.stringify({ error: "gate_off" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Resolve teacher-supplied API key (Claude/OpenAI/Gemini).
  const teacherKey = await getTeacherKeyForBoard(boardId);
  if (!teacherKey) {
    return new Response(
      JSON.stringify({
        error: "llm_key_missing",
        message:
          "담임 선생님이 /teacher/settings#llm에서 AI API Key를 먼저 저장해야 합니다.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const quota = await checkQuotaOrReject({
    classroomId: student.classroomId,
    studentId: student.id,
    classroomDailyTokenPool: cfg.classroomDailyTokenPool,
    perStudentDailyTokenCap: cfg.perStudentDailyTokenCap,
  });
  if (!quota.ok) {
    return new Response(JSON.stringify({ error: "quota_exhausted", reason: quota.reason }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Load or create the session row.
  let session = sessionId
    ? await db.vibeSession.findUnique({ where: { id: sessionId } })
    : null;
  if (session && session.studentId !== student.id) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!session) {
    session = await db.vibeSession.create({
      data: {
        studentId: student.id,
        classroomId: student.classroomId,
        messages: [],
      },
    });
  }

  const priorMessages = Array.isArray(session.messages)
    ? (session.messages as Array<{ role: "user" | "assistant"; content: string }>)
    : [];
  const nextMessages = [...priorMessages, { role: "user" as const, content: userMessage }];

  // SSE response.
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
          // Controller closed by abort — stop quietly.
        }
      };

      send({ type: "session", id: session!.id });

      try {
        const result = await streamLlm({
          provider: teacherKey.provider,
          apiKey: teacherKey.apiKey,
          baseUrl: teacherKey.baseUrl,
          modelId: teacherKey.modelId,
          systemPrompt: category ? CATEGORY_PROMPTS[category] : DEFAULT_SYSTEM_PROMPT,
          messages: nextMessages,
          studentId: student.id,
          classroomId: student.classroomId,
          perStudentDailyTokenCap: cfg.perStudentDailyTokenCap,
          classroomDailyTokenPool: cfg.classroomDailyTokenPool,
          onDelta: (delta) => send({ type: "delta", text: delta }),
          onTokensUpdate: (tokensIn, tokensOut) =>
            send({ type: "usage", tokensIn, tokensOut }),
          onRefusal: () => send({ type: "refusal" }),
        });

        // Persist the assistant reply + usage.
        await db.vibeSession.update({
          where: { id: session!.id },
          data: {
            messages: [
              ...nextMessages,
              { role: "assistant", content: result.finalContent },
            ],
            tokensIn: { increment: result.tokensIn },
            tokensOut: { increment: result.tokensOut },
            refusalCount: {
              increment: result.stopReason === "refusal" ? 1 : 0,
            },
            status: result.stopReason === "refusal" ? "failed" : "active",
          },
        });

        if (result.stopReason === "error" && result.errorMessage) {
          send({ type: "error", message: result.errorMessage });
        } else {
          send({ type: "done", stopReason: result.stopReason });
        }
      } catch (err) {
        send({ type: "error", message: String((err as Error).message) });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed (client abort)
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
