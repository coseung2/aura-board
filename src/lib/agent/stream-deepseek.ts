// DeepSeek Flash streaming provider for Agent Service.
// OpenAI-compatible API via fetch + SSE parsing.
// Phase 0: accepts apiKey as parameter (from teacher's stored LLM key).

import "server-only";

const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const DEEPSEEK_MODEL =
  process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

export type DeepSeekStreamArgs = {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  systemPrompt: string;
  apiKey: string;
  onDelta: (text: string) => void;
  signal?: AbortSignal;
};

export type DeepSeekStreamResult = {
  stopReason: "stop" | "length" | "error";
  content: string;
  tokensIn: number;
  tokensOut: number;
};

export const DEFAULT_AGENT_SYSTEM_PROMPT = `당신은 한국 초중등 학생의 AI 학습 도우미입니다.

**응답 규칙**
- 한국어로 친근하게 존댓말로 대답하세요.
- 초중등 학생 수준에 맞게 쉽고 짧게 설명하세요.
- 코드 예제가 필요하면 html/css/js 블록으로 보여주세요.

**모드별 안내**
- arcade: 게임 제작을 도와줍니다. 코드를 html 블록으로 출력하세요.
- tutor: 학습 질문에 답하고 설명해줍니다.
- code: 코딩 과제를 도와줍니다. 코드 리뷰와 디버깅을 포함합니다.
- lesson: 수업 내용을 따라갈 수 있도록 안내합니다.

부적절한 주제(폭력·성인·개인정보·상용 게임 복제 등)는 정중히 거절합니다.`;

export async function streamDeepSeek(
  args: DeepSeekStreamArgs
): Promise<DeepSeekStreamResult> {
  if (!args.apiKey) {
    return {
      stopReason: "error",
      content:
        "🧑‍🏫 아직 AI 선생님이 준비되지 않았어요. 선생님께 /teacher/settings 에서 AI 연결을 설정해달라고 요청해주세요.",
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  const apiMessages = [
    { role: "system" as const, content: args.systemPrompt },
    ...args.messages.map((m) => ({
      role: m.role === "system" ? "user" as const : m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  let finalContent = "";
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: apiMessages,
        stream: true,
        max_tokens: 4096,
      }),
      signal: args.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      return {
        stopReason: "error",
        content: `API 오류 (${response.status}): ${errBody}`,
        tokensIn: 0,
        tokensOut: 0,
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return {
        stopReason: "error",
        content: "스트림을 읽을 수 없습니다.",
        tokensIn: 0,
        tokensOut: 0,
      };
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let stopReason: "stop" | "length" | "error" = "stop";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          if (choice.delta?.content) {
            const text = choice.delta.content;
            finalContent += text;
            args.onDelta(text);
          }

          if (choice.finish_reason) {
            stopReason =
              choice.finish_reason === "stop"
                ? "stop"
                : choice.finish_reason === "length"
                  ? "length"
                  : "error";
          }

          if (parsed.usage) {
            tokensIn = parsed.usage.prompt_tokens ?? 0;
            tokensOut = parsed.usage.completion_tokens ?? 0;
          }
        } catch {
          // skip unparseable chunks
        }
      }
    }

    return { stopReason, content: finalContent, tokensIn, tokensOut };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      stopReason: "error",
      content: `오류가 발생했어요: ${message}`,
      tokensIn: 0,
      tokensOut: 0,
    };
  }
}
