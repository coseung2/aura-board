// 평어 LLM 호출 — non-streaming. teacher key 4종 (claude/openai/gemini/ollama)
// 모두 단일 인터페이스로 짧은 텍스트 한 번에 받음.
// vibe-arcade 의 streamLlm 과 분리: 학생 quota ledger 무관, 스트리밍 불필요.

import "server-only";
import type { LlmProvider } from "../llm/stream";

const MODELS: Record<Exclude<LlmProvider, "ollama">, string> = {
  claude: process.env.CLAUDE_MODEL_ID ?? "claude-sonnet-4-5",
  openai: process.env.OPENAI_MODEL_ID ?? "gpt-5.6-terra",
  gemini: process.env.GEMINI_MODEL_ID ?? "gemini-3.6-flash",
  "opencode-go": process.env.OPENCODE_MODEL_ID ?? "deepseek-v4-flash",
};

// 평어는 짧지만(60~100자) thinking 모델(Gemini 2.5 Flash 등)이 thinking
// 토큰을 먼저 소비하면 본문 자리가 모자라 잘리는 사고가 났다. 독서 피드백의
// Gemma 계열은 응답에 추론·분석 텍스트를 섞어 내보내는데, 1024 토큰이면
// 마지막 JSON 객체가 잘려 파싱 실패(502)로 이어진다. 여유 있게 잡아도 호출당
// 비용은 출력 토큰 기준 < $0.0005 수준이라 무시 가능. (2026-04-24 / 2026-08-15)
const MAX_OUTPUT_TOKENS = 4096;

function geminiThinkingConfig(model: string) {
  if (model.startsWith("gemini-3")) {
    return { thinkingLevel: "minimal" } as const;
  }
  if (model.startsWith("gemini-2.5-flash")) {
    return { thinkingBudget: 0 } as const;
  }
  return null;
}

function normalizeBaseUrl(baseUrl: string | null | undefined, fallback: string): string {
  return (baseUrl?.trim() || fallback).replace(/\/+$/, "");
}

export type FeedbackImage = {
  /** raw bytes base64 인코딩 (data: prefix 없이). */
  base64: string;
  /** "image/jpeg" | "image/png" | "image/webp" */
  mimeType: string;
};

export type GenerateFeedbackArgs = {
  provider: LlmProvider;
  apiKey: string;
  baseUrl?: string | null;
  /** Feature-specific model selected in teacher settings. */
  modelId?: string | null;
  /** Optional cancellation signal for bounded server-side requests. */
  signal?: AbortSignal;
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
    case "opencode-go":
      return callOpencodeGo(args);
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
    const model = args.modelId ?? MODELS.claude;
    const res = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: args.systemPrompt,
      messages: [{ role: "user", content: args.userPrompt }],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    return { ok: true, text, model };
  } catch (err) {
    return { ok: false, error: String((err as Error).message) };
  }
}

async function callOpenAI(args: GenerateFeedbackArgs): Promise<GenerateFeedbackResult> {
  try {
    const model = args.modelId ?? MODELS.openai;
    const baseUrl = normalizeBaseUrl(args.baseUrl, "https://api.openai.com/v1");
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: args.signal,
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
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
    return { ok: true, text, model };
  } catch (err) {
    return { ok: false, error: String((err as Error).message) };
  }
}

async function callGemini(args: GenerateFeedbackArgs): Promise<GenerateFeedbackResult> {
  try {
    const model = args.modelId ?? MODELS.gemini;
    const baseUrl = normalizeBaseUrl(
      args.baseUrl,
      "https://generativelanguage.googleapis.com/v1beta",
    );
    const url =
      `${baseUrl}/models/${encodeURIComponent(model)}:generateContent` +
      `?key=${encodeURIComponent(args.apiKey)}`;
    const thinkingConfig = geminiThinkingConfig(model);
    const res = await fetch(url, {
      method: "POST",
      signal: args.signal,
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
          ...(thinkingConfig ? { thinkingConfig } : {}),
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
    return { ok: true, text, model };
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
      signal: args.signal,
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

async function callOpencodeGo(args: GenerateFeedbackArgs): Promise<GenerateFeedbackResult> {
  const baseUrl = normalizeBaseUrl(
    args.baseUrl,
    "https://opencode.ai/zen/go/v1",
  );
  const model = args.modelId ?? MODELS["opencode-go"];

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: args.signal,
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `opencode-go http ${res.status}: ${t.slice(0, 200)}` };
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
