import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateFeedback } from "./generate";

const fetchMock = vi.fn();

describe("feature-selected feedback models", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the selected OpenAI model and completion-token field", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "완료" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await generateFeedback({
      provider: "openai",
      apiKey: "sk-test",
      modelId: "gpt-5.6-terra",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(result).toMatchObject({ ok: true, model: "gpt-5.6-terra" });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: "gpt-5.6-terra",
      max_completion_tokens: 4096,
    });
    expect(body).not.toHaveProperty("max_tokens");
  });

  it("uses thinkingLevel for Gemini 3 models", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "완료" }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await generateFeedback({
      provider: "gemini",
      apiKey: "AIza-test",
      modelId: "gemini-3.6-flash",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/models/gemini-3.6-flash:generateContent",
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: "minimal",
    });
  });

  it("uses thinkingBudget only for Gemini 2.5 Flash and omits it for Gemma", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "완료" }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await generateFeedback({
      provider: "gemini",
      apiKey: "AIza-test",
      modelId: "gemini-2.5-flash",
      systemPrompt: "system",
      userPrompt: "user",
    });
    const flashBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(flashBody.generationConfig.thinkingConfig).toEqual({
      thinkingBudget: 0,
    });

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "완료" }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await generateFeedback({
      provider: "gemini",
      apiKey: "AIza-test",
      modelId: "gemma-4-26b-a4b-it",
      systemPrompt: "system",
      userPrompt: "user",
    });
    const gemmaBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(gemmaBody.generationConfig).not.toHaveProperty("thinkingConfig");
  });
});
