import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/quiz/useQuizRealtime", () => ({
  useQuizRealtime: () => ({ onlineCount: 0, realtimeReady: false }),
}));

import { QuizPlay } from "./QuizPlay";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("QuizPlay anonymous capability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores the anonymous join token and sends it with the answer", async () => {
    const snapshot = {
      version: 1,
      quizId: "quiz-1",
      status: "active",
      currentQuestionIndex: 0,
      totalQuestions: 1,
      currentQuestion: {
        id: "question-1",
        index: 0,
        total: 1,
        text: "문제",
        options: ["첫 번째", "두 번째", "세 번째", "네 번째"],
        timeLimit: 20,
      },
      players: [{ id: "player-1", nickname: "익명", score: 0 }],
      distribution: { A: 0, B: 0, C: 0, D: 0 },
      totalAnswers: 0,
      updatedAt: "2026-07-28T00:00:00.000Z",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        player: { id: "player-1", nickname: "익명", score: 0 },
        quiz: { id: "quiz-1", status: "active" },
        playerToken: "signed-player-token",
        snapshot,
      }))
      .mockResolvedValueOnce(jsonResponse({
        correct: true,
        correctAnswer: "A",
        points: 1000,
        snapshot,
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<QuizPlay />);
    fireEvent.change(screen.getByPlaceholderText("참가 코드"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByPlaceholderText("닉네임"), {
      target: { value: "익명" },
    });
    fireEvent.click(screen.getByRole("button", { name: "입장" }));

    fireEvent.click(await screen.findByRole("button", { name: /첫 번째/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const answerInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(answerInit.body))).toMatchObject({
      questionId: "question-1",
      playerId: "player-1",
      playerToken: "signed-player-token",
      selected: "A",
    });
  });
});
