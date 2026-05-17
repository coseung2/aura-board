// Multi-provider LLM streaming for vibe-arcade (Seed 13 follow-up).
// 교사가 /docs/ai-setup에서 저장한 API Key로 Claude / OpenAI / Gemini 중
// 하나를 서버에서 호출한다. 단일 인터페이스 (streamLlm) — 기존 sonnet-provider.ts의
// streamSonnet을 대체한다.
//
// 구현 전략:
//   - Anthropic:  @anthropic-ai/sdk (이미 설치됨)
//   - OpenAI:     fetch + SSE 파싱   (의존성 추가 없이)
//   - Gemini:     fetch + NDJSON     (streamGenerateContent)
//
// 셋 다 공통 onDelta / onTokensUpdate / onRefusal 콜백으로 정규화.

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
  // ollama 전용: OpenAI 호환 엔드포인트 주소 + 모델 식별자.
  // 다른 provider에서는 무시된다.
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

export const DEFAULT_SYSTEM_PROMPT = `당신은 한국 초중등 학생의 바이브 코딩 보조교사입니다.

**실행 환경 (매우 중요)**
학생 화면 오른쪽에 실시간 미리보기(iframe)가 있어서 당신이 출력한 코드는 자동으로 그 창에서 실행됩니다. 학생은 파일 저장이나 브라우저 열기를 할 필요가 전혀 없습니다. "저장해서 열어 보세요" · "파일로 만드세요" 같은 안내는 절대 하지 마세요.

**출력 형식 (엄격)**
- 코드 응답은 반드시 \`\`\`html 으로 시작하고 \`\`\` 으로 닫는 하나의 블록이어야 합니다.
- 그 HTML 안에 <style> 과 <script> 를 모두 포함 — CSS/JS 를 별도 블록으로 쪼개지 말 것.
- 수정 요청이 오면 전체 문서를 같은 \`\`\`html 블록으로 다시 출력.
- 외부 CDN 은 jsdelivr / cdnjs / unpkg 만 허용.

부적절한 주제(폭력·성인·개인정보·상용 게임 복제 등)는 정중히 거절합니다.
한국 초·중등 학생 대상 — 쉬운 말, 짧고 친근하게, 존댓말 유지.`;

const MODELS: Record<Exclude<LlmProvider, "ollama">, string> = {
  claude: process.env.CLAUDE_MODEL_ID ?? "claude-sonnet-4-5",
  openai: process.env.OPENAI_MODEL_ID ?? "gpt-4o-mini",
  gemini: process.env.GEMINI_MODEL_ID ?? "gemini-2.5-flash",
};
// ollama 는 교사가 저장 시 입력한 modelId 를 런타임에 그대로 사용 (MODELS 비적용).

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
      // OpenCode-go 스트리밍은 Agent Service에서 처리 (stream-deepseek.ts)
      // Vibe Arcade에서 opencode-go 사용 시 여기에 추가
      return {
        stopReason: "error",
        finalContent: "",
        tokensIn: 0,
        tokensOut: 0,
        errorMessage: "OpenCode-go는 Agent Service에서 사용하세요.",
      };
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

// ───────────────────── Claude (Anthropic) ─────────────────────

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

// ───────────────────── OpenAI (Chat Completions SSE) ─────────────────────

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

// ───────────────────── Gemini (streamGenerateContent NDJSON) ─────────────────────

async function streamGemini(args: LlmStreamArgs): Promise<LlmStreamResult> {
  let tokensIn = 0;
  let tokensOut = 0;
  let finalContent = "";

  try {
    // Gemini는 system을 별도 필드로, assistant는 "model" role로 받는다.
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

// ───────────────────── Ollama (로컬 테스트 — OpenAI 호환) ─────────────────────
// 교사 PC에 Ollama가 설치돼 있다는 전제. `/v1/chat/completions` 가 OpenAI와
// 동일한 SSE 포맷을 돌려준다. usage 필드가 없거나 다를 수 있어 문자 길이로
// 대충 추정 (배포 환경이 아니라 본인 개발 PC에서만 쓰는 경로).
async function streamOllama(args: LlmStreamArgs): Promise<LlmStreamResult> {
  const baseUrl = (args.baseUrl ?? "").replace(/\/+$/, "");
  const model = args.modelId ?? "";
  if (!baseUrl || !model) {
    return {
      stopReason: "error",
      finalContent: "",
      tokensIn: 0,
      tokensOut: 0,
      errorMessage: "ollama: baseUrl / modelId 가 설정되지 않았습니다.",
    };
  }

  let tokensIn = 0;
  let tokensOut = 0;
  let finalContent = "";

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        // Ollama는 API Key 미요구지만 reverse-proxy 보호용으로 넣을 수 있음.
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

    // Ollama usage 미제공 시 글자 수 기반으로 근사치 제공 — quota ledger 가
    // 0으로 내려가 쿼터 카운팅이 안 되는 것 방지.
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

// ───────────────────── Test ping (저장 시 검증용) ─────────────────────
// 저장된 Key가 실제로 유효한지 각 사 API에 최소 호출을 보내 확인한다.
// 성공(true) or 실패사유(string). "verified" 표시에만 사용.

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
        return { ok: false, error: "baseUrl 과 modelId 가 모두 필요합니다." };
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
          error: `모델 '${modelId}' 을(를) 찾을 수 없습니다. 설치된 모델: ${ids.slice(0, 5).join(", ")}`,
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
      return { ok: true }; // 로컬 CLI — 항상 사용 가능
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
