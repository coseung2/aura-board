// 평어 LLM 호출 — non-streaming. teacher key 4종 (claude/openai/gemini/ollama)
// 모두 단일 인터페이스로 짧은 텍스트 한 번에 받음.
// vibe-arcade 의 streamLlm 과 분리: 학생 quota ledger 무관, 스트리밍 불필요.

import "server-only";
import type { LlmProvider } from "../llm/stream";

const MODELS: Record<Exclude<LlmProvider, "ollama">, string> = {
  claude: process.env.CLAUDE_MODEL_ID ?? "claude-sonnet-4-5",
  openai: process.env.OPENAI_MODEL_ID ?? "gpt-4o-mini",
  gemini: process.env.GEMINI_MODEL_ID ?? "gemini-2.5-flash",
  "opencode-go": process.env.OPENCODE_MODEL_ID ?? "opencode/deepseek-v4-flash-free",
};

// 평어는 짧지만(60~100자) thinking 모델(Gemini 2.5 Flash 등)이 thinking
// 토큰을 먼저 소비하면 본문 자리가 모자라 잘리는 사고가 났다. 여유 있게 잡아도
// 호출당 비용은 출력 토큰 기준 < $0.0002 수준이라 무시 가능. (2026-04-24)
const MAX_OUTPUT_TOKENS = 1024;

export type FeedbackImage = {
  /** raw bytes base64 인코딩 (data: prefix 없이). */
  base64: string;
  /** "image/jpeg" | "image/png" | "image/webp" */
  mimeType: string;
};

export type GenerateFeedbackArgs = {
  provider: LlmProvider;
  apiKey: string;
  baseUrl?: string | null; // ollama only
  modelId?: string | null; // ollama only
  systemPrompt: string;
  userPrompt: string;
  /** 학생 작품 이미지. 비전 지원 provider(Gemini)만 사용. 그 외는 무시. */
  image?: FeedbackImage | null;
};

export type GenerateFeedbackResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string };

export async function generateFeedback(
  args: GenerateFeedbackArgs
): Promise<GenerateFeedbackResult> {
  switch (args.provider) {
    case "claude":
      return callClaude(args);
    case "openai":
      return callOpenAI(args);
    case "gemini":
      return callGemini(args);
    case "ollama":
      return callOllama(args);
    default:
      return { ok: false, error: `unknown provider: ${args.provider as string}` };
  }
}

async function callClaude(args: GenerateFeedbackArgs): Promise<GenerateFeedbackResult> {
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk").catch(() => ({
      default: null as unknown as new (opts: { apiKey: string }) => unknown,
    }));
    if (!Anthropic) return { ok: false, error: "anthropic sdk not installed" };
    const client = new (Anthropic as unknown as new (opts: { apiKey: string }) => {
      messages: {
        create: (opts: unknown) => Promise<{
          content: Array<{ type: string; text?: string }>;
        }>;
      };
    })({ apiKey: args.apiKey });
    const res = await client.messages.create({
      model: MODELS.claude,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: args.systemPrompt,
      messages: [{ role: "user", content: args.userPrompt }],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    return { ok: true, text, model: MODELS.claude };
  } catch (err) {
    return { ok: false, error: String((err as Error).message) };
  }
}

async function callOpenAI(args: GenerateFeedbackArgs): Promise<GenerateFeedbackResult> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELS.openai,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `openai http ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    return { ok: true, text, model: MODELS.openai };
  } catch (err) {
    return { ok: false, error: String((err as Error).message) };
  }
}

async function callGemini(args: GenerateFeedbackArgs): Promise<GenerateFeedbackResult> {
  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODELS.gemini)}:generateContent` +
      `?key=${encodeURIComponent(args.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: args.systemPrompt }] },
        contents: [
          {
            role: "user",
            parts: [
              ...(args.image
                ? [
                    {
                      inlineData: {
                        mimeType: args.image.mimeType,
                        data: args.image.base64,
                      },
                    },
                  ]
                : []),
              { text: args.userPrompt },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          // Gemini 2.5 Flash 의 thinking 토큰이 maxOutputTokens 한도를 잠식해
          // 본문이 잘리는 회귀를 차단. 평어는 chain-of-thought 가 필요한 작업이
          // 아니라 thinking 비활성이 안전.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `gemini http ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    return { ok: true, text, model: MODELS.gemini };
  } catch (err) {
    return { ok: false, error: String((err as Error).message) };
  }
}

async function callOllama(args: GenerateFeedbackArgs): Promise<GenerateFeedbackResult> {
  const baseUrl = (args.baseUrl ?? "").replace(/\/+$/, "");
  const model = args.modelId ?? "";
  if (!baseUrl || !model) {
    return { ok: false, error: "ollama: baseUrl / modelId 가 설정되지 않았습니다." };
  }
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        ...(args.apiKey ? { Authorization: `Bearer ${args.apiKey}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `ollama http ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    return { ok: true, text, model };
  } catch (err) {
    return { ok: false, error: String((err as Error).message) };
  }
}
