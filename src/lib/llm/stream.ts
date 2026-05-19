// Multi-provider LLM streaming for vibe-arcade.
// Teachers store one API key and this module calls the selected provider
// behind a single streamLlm interface.
//
// Provider adapters:
//   - Anthropic SDK for Claude
//   - OpenAI-compatible Chat Completions SSE
//   - Gemini streamGenerateContent NDJSON
//   - Ollama/OpenAI-compatible local endpoints

import "server-only";
import { incrementLedger } from "../vibe-arcade/quota-ledger";

export type LlmProvider = "claude" | "openai" | "gemini" | "ollama" | "opencode-go";

export type LlmStreamArgs = {
  provider: LlmProvider;
  apiKey: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  studentId: string;
  classroomId: string;
  perStudentDailyTokenCap: number | null;
  classroomDailyTokenPool: number;
  onDelta: (delta: string) => void;
  onTokensUpdate: (tokensIn: number, tokensOut: number) => void;
  onRefusal: () => void;
  // Ollama uses an OpenAI-compatible base URL plus a teacher-selected model.
  baseUrl?: string | null;
  modelId?: string | null;
};

export type LlmStreamResult = {
  stopReason: "end_turn" | "max_tokens" | "refusal" | "quota_exhausted" | "error";
  finalContent: string;
  tokensIn: number;
  tokensOut: number;
  errorMessage?: string;
};

export const DEFAULT_SYSTEM_PROMPT = `당신은 한국 초중등 학생을 돕는 바이브 코딩 보조교사입니다.

**실행 환경**
학생 화면 오른쪽에는 실시간 미리보기 iframe이 있습니다. 당신이 출력한 HTML은 자동으로 그 창에서 실행됩니다. 파일 저장, 브라우저 열기, 다운로드 같은 안내는 하지 마세요.

**출력 형식**
- 코드 응답은 반드시 하나의 \`\`\`html 코드블록으로만 작성합니다.
- 그 HTML 안에 <style>과 <script>를 모두 포함합니다. CSS/JS를 별도 블록으로 나누지 않습니다.
- 수정 요청에도 전체 문서를 다시 \`\`\`html 코드블록으로 출력합니다.
- 외부 CDN은 jsdelivr, cdnjs, unpkg만 사용합니다.

폭력, 성적 내용, 개인정보 침해, 악용 가능한 게임 복제처럼 부적절한 요청은 짧고 단호하게 거절합니다.
초중등 학생에게 맞는 쉬운 말로, 친근하지만 장난스럽게 흐르지 않도록 안내하세요.`;

const MODELS: Record<Exclude<LlmProvider, "ollama">, string> = {
  claude: process.env.CLAUDE_MODEL_ID ?? "claude-sonnet-4-5",
  openai: process.env.OPENAI_MODEL_ID ?? "gpt-4o-mini",
  gemini: process.env.GEMINI_MODEL_ID ?? "gemini-2.5-flash",
  "opencode-go": process.env.OPENCODE_MODEL_ID ?? "opencode/deepseek-v4-flash-free",
};
// Ollama uses the teacher-provided modelId instead of MODELS.

/** Dispatch to the right provider adapter. */
export async function streamLlm(args: LlmStreamArgs): Promise<LlmStreamResult> {
  switch (args.provider) {
    case "claude":
      return streamClaude(args);
    case "openai":
      return streamOpenAI(args);
    case "gemini":
      return streamGemini(args);
    case "ollama":
      return streamOllama(args);
    case "opencode-go":
      return streamOpencodeGo(args);
    default:
      return {
        stopReason: "error",
        finalContent: "",
        tokensIn: 0,
        tokensOut: 0,
        errorMessage: `unknown provider: ${args.provider as string}`,
      };
  }
}

// Claude (Anthropic) adapter

async function streamClaude(args: LlmStreamArgs): Promise<LlmStreamResult> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk").catch(() => ({
    default: null as unknown as new (opts: { apiKey: string }) => unknown,
  }));
  if (!Anthropic) {
    return { stopReason: "error", finalContent: "", tokensIn: 0, tokensOut: 0, errorMessage: "anthropic sdk not installed" };
  }

  let tokensIn = 0;
  let tokensOut = 0;
  let finalContent = "";

  try {
    const client = new (Anthropic as unknown as new (opts: { apiKey: string }) => {
      messages: {
        stream: (opts: unknown) => AsyncIterable<unknown> & {
          finalMessage: () => Promise<{
            content: Array<{ type: string; text?: string }>;
            stop_reason: string;
            usage?: { input_tokens?: number; output_tokens?: number };
          }>;
        };
      };
    })({ apiKey: args.apiKey });

    const stream = client.messages.stream({
      model: MODELS.claude,
      max_tokens: 4096,
      system: args.systemPrompt,
      messages: args.messages,
    });

    for await (const event of stream) {
      const ev = event as { type?: string; delta?: { text?: string }; usage?: { input_tokens?: number; output_tokens?: number } };
      if (ev.type === "content_block_delta" && ev.delta?.text) {
        args.onDelta(ev.delta.text);
        finalContent += ev.delta.text;
      } else if (ev.type === "message_delta" && ev.usage) {
        tokensIn = ev.usage.input_tokens ?? tokensIn;
        tokensOut = ev.usage.output_tokens ?? tokensOut;
        args.onTokensUpdate(tokensIn, tokensOut);
      }
    }

    const final = await stream.finalMessage();
    tokensIn = final.usage?.input_tokens ?? tokensIn;
    tokensOut = final.usage?.output_tokens ?? tokensOut;

    if (final.stop_reason === "refusal") {
      args.onRefusal();
      return { stopReason: "refusal", finalContent, tokensIn, tokensOut };
    }

    await incrementLedger({
      classroomId: args.classroomId,
      studentId: args.studentId,
      tokensIn,
      tokensOut,
      newSession: true,
    });

    return {
      stopReason: final.stop_reason === "max_tokens" ? "max_tokens" : "end_turn",
      finalContent,
      tokensIn,
      tokensOut,
    };
  } catch (err) {
    return {
      stopReason: "error",
      finalContent,
      tokensIn,
      tokensOut,
      errorMessage: String((err as Error).message),
    };
  }
}

// OpenAI Chat Completions SSE adapter

async function streamOpenAI(args: LlmStreamArgs): Promise<LlmStreamResult> {
  let tokensIn = 0;
  let tokensOut = 0;
  let finalContent = "";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELS.openai,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: 4096,
        messages: [
          { role: "system", content: args.systemPrompt },
          ...args.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      return {
        stopReason: "error",
        finalContent,
        tokensIn,
        tokensOut,
        errorMessage: `openai http ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let stopReason: LlmStreamResult["stopReason"] = "end_turn";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") break;
        try {
          const ev = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const delta = ev.choices?.[0]?.delta?.content;
          if (delta) {
            args.onDelta(delta);
            finalContent += delta;
          }
          const finish = ev.choices?.[0]?.finish_reason;
          if (finish === "length") stopReason = "max_tokens";
          if (ev.usage) {
            tokensIn = ev.usage.prompt_tokens ?? tokensIn;
            tokensOut = ev.usage.completion_tokens ?? tokensOut;
            args.onTokensUpdate(tokensIn, tokensOut);
          }
        } catch {
          // skip malformed chunk
        }
      }
    }

    await incrementLedger({
      classroomId: args.classroomId,
      studentId: args.studentId,
      tokensIn,
      tokensOut,
      newSession: true,
    });

    return { stopReason, finalContent, tokensIn, tokensOut };
  } catch (err) {
    return {
      stopReason: "error",
      finalContent,
      tokensIn,
      tokensOut,
      errorMessage: String((err as Error).message),
    };
  }
}

// Gemini streamGenerateContent adapter
async function streamGemini(args: LlmStreamArgs): Promise<LlmStreamResult> {
  let tokensIn = 0;
  let tokensOut = 0;
  let finalContent = "";

  try {
    // Gemini accepts the system prompt as a user/model content sequence.
    const contents = args.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODELS.gemini)}:streamGenerateContent` +
      `?alt=sse&key=${encodeURIComponent(args.apiKey)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: args.systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 4096 },
      }),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      return {
        stopReason: "error",
        finalContent,
        tokensIn,
        tokensOut,
        errorMessage: `gemini http ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let stopReason: LlmStreamResult["stopReason"] = "end_turn";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const ev = JSON.parse(payload) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
              finishReason?: string;
            }>;
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
          };
          const parts = ev.candidates?.[0]?.content?.parts ?? [];
          for (const p of parts) {
            if (p.text) {
              args.onDelta(p.text);
              finalContent += p.text;
            }
          }
          const finish = ev.candidates?.[0]?.finishReason;
          if (finish === "MAX_TOKENS") stopReason = "max_tokens";
          if (finish === "SAFETY" || finish === "BLOCKLIST") {
            args.onRefusal();
            stopReason = "refusal";
          }
          if (ev.usageMetadata) {
            tokensIn = ev.usageMetadata.promptTokenCount ?? tokensIn;
            tokensOut = ev.usageMetadata.candidatesTokenCount ?? tokensOut;
            args.onTokensUpdate(tokensIn, tokensOut);
          }
        } catch {
          // skip malformed chunk
        }
      }
    }

    if (stopReason !== "refusal") {
      await incrementLedger({
        classroomId: args.classroomId,
        studentId: args.studentId,
        tokensIn,
        tokensOut,
        newSession: true,
      });
    }

    return { stopReason, finalContent, tokensIn, tokensOut };
  } catch (err) {
    return {
      stopReason: "error",
      finalContent,
      tokensIn,
      tokensOut,
      errorMessage: String((err as Error).message),
    };
  }
}

// Ollama OpenAI-compatible adapter
async function streamOllama(args: LlmStreamArgs): Promise<LlmStreamResult> {
  const baseUrl = (args.baseUrl ?? "").replace(/\/+$/, "");
  const model = args.modelId ?? "";
  if (!baseUrl || !model) {
    return {
      stopReason: "error",
      finalContent: "",
      tokensIn: 0,
      tokensOut: 0,
      errorMessage: "ollama: baseUrl/modelId is not configured",
    };
  }

  let tokensIn = 0;
  let tokensOut = 0;
  let finalContent = "";

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        // Ollama usually does not need an API key, but a reverse proxy might.
        ...(args.apiKey ? { Authorization: `Bearer ${args.apiKey}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: args.systemPrompt },
          ...args.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      return {
        stopReason: "error",
        finalContent,
        tokensIn,
        tokensOut,
        errorMessage: `ollama http ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let stopReason: LlmStreamResult["stopReason"] = "end_turn";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") break;
        try {
          const ev = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const delta = ev.choices?.[0]?.delta?.content;
          if (delta) {
            args.onDelta(delta);
            finalContent += delta;
          }
          const finish = ev.choices?.[0]?.finish_reason;
          if (finish === "length") stopReason = "max_tokens";
          if (ev.usage) {
            tokensIn = ev.usage.prompt_tokens ?? tokensIn;
            tokensOut = ev.usage.completion_tokens ?? tokensOut;
            args.onTokensUpdate(tokensIn, tokensOut);
          }
        } catch {
          // skip malformed chunk
        }
      }
    }

    // Ollama often omits usage; estimate tokens from text length for quota accounting.
    if (tokensIn === 0 && tokensOut === 0) {
      const promptChars = args.messages.reduce((n, m) => n + m.content.length, 0);
      tokensIn = Math.ceil(promptChars / 3);
      tokensOut = Math.ceil(finalContent.length / 3);
      args.onTokensUpdate(tokensIn, tokensOut);
    }

    await incrementLedger({
      classroomId: args.classroomId,
      studentId: args.studentId,
      tokensIn,
      tokensOut,
      newSession: true,
    });

    return { stopReason, finalContent, tokensIn, tokensOut };
  } catch (err) {
    return {
      stopReason: "error",
      finalContent,
      tokensIn,
      tokensOut,
      errorMessage: String((err as Error).message),
    };
  }
}

// OpenCode provider adapter
async function streamOpencodeGo(args: LlmStreamArgs): Promise<LlmStreamResult> {
  const baseUrl = (args.baseUrl ?? "").replace(/\/+$/, "") || process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/go/v1";
  const model = args.modelId || MODELS["opencode-go"];

  let tokensIn = 0;
  let tokensOut = 0;
  let finalContent = "";

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: 4096,
        messages: [
          { role: "system", content: args.systemPrompt },
          ...args.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      return {
        stopReason: "error",
        finalContent,
        tokensIn,
        tokensOut,
        errorMessage: `opencode-go http ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let stopReason: LlmStreamResult["stopReason"] = "end_turn";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") break;
        try {
          const ev = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const delta = ev.choices?.[0]?.delta?.content;
          if (delta) {
            args.onDelta(delta);
            finalContent += delta;
          }
          const finish = ev.choices?.[0]?.finish_reason;
          if (finish === "length") stopReason = "max_tokens";
          if (ev.usage) {
            tokensIn = ev.usage.prompt_tokens ?? tokensIn;
            tokensOut = ev.usage.completion_tokens ?? tokensOut;
            args.onTokensUpdate(tokensIn, tokensOut);
          }
        } catch {
          // skip malformed chunk
        }
      }
    }

    await incrementLedger({
      classroomId: args.classroomId,
      studentId: args.studentId,
      tokensIn,
      tokensOut,
      newSession: true,
    });

    return { stopReason, finalContent, tokensIn, tokensOut };
  } catch (err) {
    return {
      stopReason: "error",
      finalContent,
      tokensIn,
      tokensOut,
      errorMessage: String((err as Error).message),
    };
  }
}

// Lightweight provider key check used by the teacher settings UI.
export async function verifyApiKey(
  provider: LlmProvider,
  apiKey: string,
  extra?: { baseUrl?: string | null; modelId?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (provider === "ollama") {
      const baseUrl = (extra?.baseUrl ?? "").replace(/\/+$/, "");
      const modelId = extra?.modelId ?? "";
      if (!baseUrl || !modelId) {
        return { ok: false, error: "baseUrl and modelId are required" };
      }
      const res = await fetch(`${baseUrl}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      const data = (await res.json().catch(() => ({}))) as {
        data?: Array<{ id?: string }>;
      };
      const ids = (data.data ?? []).map((m) => m.id ?? "");
      if (ids.length && !ids.includes(modelId)) {
        return {
          ok: false,
          error: `model '${modelId}' was not found. Installed models: ${ids.slice(0, 5).join(", ")}`,
        };
      }
      return { ok: true };
    }
    if (provider === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODELS.claude,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      if (res.ok) return { ok: true };
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (res.ok) return { ok: true };
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      );
      if (res.ok) return { ok: true };
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    if (provider === "opencode-go") {
      const baseUrl = (extra?.baseUrl ?? "").replace(/\/+$/, "") || "https://opencode.ai/zen/go/v1";
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) return { ok: true };
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: false, error: `unknown provider: ${provider as string}` };
  } catch (err) {
    return { ok: false, error: String((err as Error).message) };
  }
}

/** Extract the first ```html fenced block from assistant content. */
export function extractHtmlBlock(content: string): string | null {
  const m = content.match(/```html\s*\n([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}
