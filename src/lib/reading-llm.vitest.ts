import { afterEach, describe, expect, it, vi } from "vitest";

import {
  evaluateReadingWithLlm,
  ReadingLlmError,
  sanitizeReadingEvaluationInput,
} from "./reading-llm";

const evaluation = {
  comprehensionScore: 2,
  evidenceScore: 2,
  personalResponseScore: 3,
  expressionScore: 1,
  strength: "자신의 생각을 분명히 표현했어요.",
  evidence: "친구를 소중히 생각해야 한다고 쓴 부분에서 드러나요.",
  question: "그 생각이 들게 한 장면은 무엇이었나요?",
  nextAction: "다음에는 장면과 이유를 함께 적어 보세요.",
};

describe("provider-neutral reading LLM adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("redacts common personal data patterns before sending the reflection", () => {
    expect(
      sanitizeReadingEvaluationInput({
        bookType: "story",
        title: "책",
        author: "작가",
        reflection:
          "연락처는 010-1234-5678이고 test@example.com 또는 https://example.com으로 연락해요.",
      }).reflection,
    ).toBe("연락처는 [전화번호 삭제]이고 [이메일 삭제] 또는 [링크 삭제] 연락해요.");
  });

  it.each([
    {
      provider: "openai" as const,
      modelId: "gpt-5.6-terra",
      apiKey: "sk-openai-test",
      baseUrl: "https://teacher-openai.example/v1///",
      expectedUrl: "https://teacher-openai.example/v1/chat/completions",
      response: { choices: [{ message: { content: JSON.stringify(evaluation) } }] },
    },
    {
      provider: "gemini" as const,
      modelId: "gemini-2.5-pro",
      apiKey: "AIza-gemini-test",
      baseUrl: "https://teacher-gemini.example/v1///",
      expectedUrl:
        "https://teacher-gemini.example/v1/models/gemini-2.5-pro:generateContent?key=AIza-gemini-test",
      response: {
        candidates: [{ content: { parts: [{ text: JSON.stringify(evaluation) }] } }],
      },
    },
    {
      provider: "opencode-go" as const,
      modelId: "deepseek-v4-pro",
      apiKey: "opencode-test",
      baseUrl: "https://teacher-opencode.example/v1///",
      expectedUrl: "https://teacher-opencode.example/v1/chat/completions",
      response: { choices: [{ message: { content: JSON.stringify(evaluation) } }] },
    },
  ])(
    "uses the configured $provider endpoint, credentials, and model exactly once",
    async ({ provider, modelId, apiKey, baseUrl, expectedUrl, response }) => {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe(expectedUrl);
        const headers = new Headers(init?.headers);
        const requestBody = JSON.parse(String(init?.body)) as {
          model?: string;
          max_completion_tokens?: number;
          max_tokens?: number;
          messages?: Array<{ role: string; content: string }>;
          contents?: Array<{
            role: string;
            parts: Array<{ text?: string }>;
          }>;
        };

        if (provider === "gemini") {
          expect(new URL(url).searchParams.get("key")).toBe(apiKey);
          expect(headers.get("authorization")).toBeNull();
          expect(requestBody).toMatchObject({
            contents: [
              {
                role: "user",
                parts: [{ text: expect.stringContaining('"title":"어린 왕자"') }],
              },
            ],
          });
        } else {
          expect(headers.get("authorization")).toBe(`Bearer ${apiKey}`);
          expect(requestBody).toMatchObject({
            model: modelId,
            messages: [
              { role: "system", content: expect.any(String) },
              { role: "user", content: expect.stringContaining('"title":"어린 왕자"') },
            ],
          });
          expect(requestBody.messages?.[1]?.content).not.toContain("010-1234-5678");
        }

        if (provider === "openai") {
          expect(requestBody.max_completion_tokens).toBe(1024);
        }
        if (provider === "opencode-go") {
          expect(requestBody.max_tokens).toBe(1024);
        }

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await evaluateReadingWithLlm({
        provider,
        apiKey,
        modelId,
        baseUrl,
        input: {
          bookType: "story",
          title: "어린 왕자",
          author: "생텍쥐페리",
          reflection: "친구를 소중히 생각해야 해요. 010-1234-5678",
        },
      });

      expect(result.model).toBe(modelId);
      expect(result.evaluation.score).toBe(8);
      expect(result.evaluation.feedback).toContain("다음 기록:");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("maps provider quota responses to a retryable domain error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota", { status: 429 })),
    );

    await expect(
      evaluateReadingWithLlm({
        provider: "gemini",
        apiKey: "test-key",
        modelId: "gemini-2.5-flash",
        baseUrl: null,
        input: {
          bookType: "story",
          title: "책",
          author: "작가",
          reflection: "감상",
        },
      }),
    ).rejects.toMatchObject<Partial<ReadingLlmError>>({
      code: "quota_exceeded",
      providerStatus: 429,
    });
  });

  it("uses the official OpenCode-go endpoint when the teacher has no base URL", async () => {
    vi.stubEnv("OPENCODE_BASE_URL", "https://hidden-env.example/v1");
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("https://opencode.ai/zen/go/v1/chat/completions");
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(evaluation) } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await evaluateReadingWithLlm({
      provider: "opencode-go",
      apiKey: "opencode-test",
      modelId: "deepseek-v4-pro",
      baseUrl: null,
      input: {
        bookType: "story",
        title: "책",
        author: "작가",
        reflection: "감상",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
