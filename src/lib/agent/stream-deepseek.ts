import "server-only";

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

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

export const DEFAULT_AGENT_SYSTEM_PROMPT = `당신은 한국 초중등 학생을 돕는 AI 학습 도우미입니다.

응답 규칙:
- 한국어로 친절하고 짧게 답하세요.
- 초중등 학생 눈높이에 맞게 쉽고 구체적으로 설명하세요.
- 반드시 JSON 객체 하나로만 답하세요.
- JSON 형식은 {"message":"학생에게 보여줄 설명","code":"실행할 전체 코드 또는 빈 문자열"} 입니다.
- code가 필요하다면 단일 HTML 문서 전체를 넣으세요. CSS와 JS는 HTML 안의 <style>, <script>에 포함하세요.
- 폭력, 성적 내용, 개인정보, 상업용 게임 복제처럼 부적절한 요청은 거절하세요.`;

export async function streamDeepSeek(args: DeepSeekStreamArgs): Promise<DeepSeekStreamResult> {
  if (!args.apiKey) {
    return {
      stopReason: "error",
      content: "아직 AI 연결이 준비되지 않았어요. 선생님에게 AI 설정을 확인해 달라고 요청해 주세요.",
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  const apiMessages = [
    { role: "system" as const, content: args.systemPrompt },
    ...args.messages.map((message) => ({
      role: message.role === "system" ? ("user" as const) : (message.role as "user" | "assistant"),
      content: message.content,
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
        response_format: { type: "json_object" },
        stream: true,
        max_tokens: 4096,
      }),
      signal: args.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return {
        stopReason: "error",
        content: `API 오류 (${response.status}): ${errorBody}`,
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
          // Ignore malformed chunks from the provider.
        }
      }
    }

    return { stopReason, content: finalContent, tokensIn, tokensOut };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      stopReason: "error",
      content: `오류가 발생했어요: ${message}`,
      tokensIn: 0,
      tokensOut: 0,
    };
  }
}
