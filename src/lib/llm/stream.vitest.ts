import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  incrementLedger: vi.fn(),
}));

vi.mock("../vibe-arcade/quota-ledger", () => ({
  incrementLedger: mocks.incrementLedger,
}));

import { streamLlm } from "./stream";

const fetchMock = vi.fn();

function openAiSseResponse() {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"안녕"},"finish_reason":null}]}\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":3}}\n',
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n"));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

describe("streamLlm feature model routing", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mocks.incrementLedger.mockReset();
    fetchMock.mockResolvedValue(openAiSseResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams with the selected OpenAI model and can skip Vibe quota accounting", async () => {
    const deltas: string[] = [];
    const result = await streamLlm({
      provider: "openai",
      apiKey: "sk-test",
      modelId: "gpt-5.6-sol",
      systemPrompt: "system",
      messages: [{ role: "user", content: "질문" }],
      studentId: "student-1",
      classroomId: "classroom-1",
      perStudentDailyTokenCap: null,
      classroomDailyTokenPool: 0,
      trackUsageLedger: false,
      jsonMode: true,
      onDelta: (text) => deltas.push(text),
      onTokensUpdate: () => undefined,
      onRefusal: () => undefined,
    });

    expect(result).toMatchObject({
      stopReason: "end_turn",
      finalContent: "안녕",
      tokensIn: 12,
      tokensOut: 3,
    });
    expect(deltas).toEqual(["안녕"]);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      model: "gpt-5.6-sol",
      max_completion_tokens: 4096,
      response_format: { type: "json_object" },
    });
    expect(mocks.incrementLedger).not.toHaveBeenCalled();
  });
});
