import { afterEach, describe, expect, it, vi } from "vitest";

import {
  evaluateReadingWithGemma,
  ReadingGemmaError,
  sanitizeReadingEvaluationInput,
} from "./reading-gemma";

describe("reading Gemma adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redacts common personal data patterns before sending the reflection", () => {
    expect(
      sanitizeReadingEvaluationInput({
        bookType: "story",
        title: "책",
        author: "작가",
        reflection: "연락처는 010-1234-5678이고 test@example.com 또는 https://example.com으로 연락해요.",
      }).reflection,
    ).toBe("연락처는 [전화번호 삭제]이고 [이메일 삭제] 또는 [링크 삭제] 연락해요.");
  });

  it("parses function-call output and calculates the final score on the server", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as {
        contents: Array<{ parts: Array<{ text: string }> }>;
      };
      expect(requestBody.contents[0].parts[0].text).not.toContain("010-1234-5678");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "submit_reading_evaluation",
                      args: {
                        comprehensionScore: 2,
                        evidenceScore: 2,
                        personalResponseScore: 3,
                        expressionScore: 1,
                        strength: "자신의 생각을 분명히 표현했어요.",
                        evidence: "친구를 소중히 생각해야 한다고 쓴 부분에서 드러나요.",
                        question: "그 생각이 들게 한 장면은 무엇이었나요?",
                        nextAction: "다음에는 장면과 이유를 함께 적어 보세요.",
                      },
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateReadingWithGemma({
      apiKey: "test-key",
      modelId: "gemma-test",
      input: {
        bookType: "story",
        title: "어린 왕자",
        author: "생텍쥐페리",
        reflection: "친구를 소중히 생각해야 해요. 010-1234-5678",
      },
    });

    expect(result.model).toBe("gemma-test");
    expect(result.evaluation.score).toBe(8);
    expect(result.evaluation.feedback).toContain("다음 기록:");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps provider quota responses to a retryable domain error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota", { status: 429 })),
    );

    await expect(
      evaluateReadingWithGemma({
        apiKey: "test-key",
        input: {
          bookType: "story",
          title: "책",
          author: "작가",
          reflection: "감상",
        },
      }),
    ).rejects.toMatchObject<Partial<ReadingGemmaError>>({
      code: "quota_exceeded",
      providerStatus: 429,
    });
  });
});
