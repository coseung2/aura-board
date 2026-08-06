import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LiveQuizStateResponse } from "@/lib/live-quiz/contracts";
import { LiveQuizLivePanel } from "./LiveQuizLivePanel";

function liveState(
  overrides: Partial<LiveQuizStateResponse> = {},
): LiveQuizStateResponse {
  return {
    phase: "live",
    serverNow: "2026-08-06T04:30:00.000Z",
    sessionKey: "2026-08-06",
    startsAt: "2026-08-06T04:30:00.000Z",
    endsAt: "2026-08-06T04:34:10.000Z",
    nextStartsAt: "2026-08-06T04:30:00.000Z",
    questionCount: 10,
    score: 0,
    answeredCount: 0,
    questionNumber: 1,
    stage: "answer",
    stageEndsAt: "2026-08-06T04:30:20.000Z",
    question: {
      id: "question-1",
      prompt: "대한민국의 수도는 어디일까요?",
      choices: ["서울", "부산", "대전", "광주"],
      category: "상식",
    },
    selectedChoice: null,
    correctChoice: null,
    isCorrect: null,
    explanation: null,
    activeAnswerCount: 3,
    setupReason: null,
    ...overrides,
  };
}

function renderPanel(
  state: LiveQuizStateResponse,
  options: { loadError?: string | null; onRetry?: () => void } = {},
) {
  render(
    <LiveQuizLivePanel
      contentClassName="content"
      state={state}
      loading={false}
      loadError={options.loadError ?? null}
      nowMs={Date.parse("2026-08-06T04:30:10.000Z")}
      selectedChoice={state.selectedChoice}
      answering={false}
      answerError={null}
      onRetry={options.onRetry ?? vi.fn()}
      onAnswer={vi.fn()}
      onSuggest={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("LiveQuizLivePanel", () => {
  it("shows the next broadcast after an underfilled day and exposes retry", () => {
    const onRetry = vi.fn();
    renderPanel(
      liveState({
        phase: "setup",
        startsAt: "2026-08-06T04:30:00.000Z",
        nextStartsAt: "2026-08-07T04:30:00.000Z",
        questionCount: 2,
        questionNumber: null,
        stage: null,
        stageEndsAt: "2026-08-06T04:30:00.000Z",
        question: null,
        setupReason: "방송을 시작하려면 승인된 문제가 4개 이상 필요합니다.",
      }),
      {
        loadError: "라이브 퀴즈 상태를 불러오지 못했습니다.",
        onRetry,
      },
    );

    expect(screen.getByText("다음 방송 준비 중")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "다음 방송 문제를 모으고 있어요" }),
    ).toBeTruthy();
    expect(screen.getByText(/다음 방송은/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 동기화" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not announce the waiting countdown every second", () => {
    renderPanel(
      liveState({
        phase: "waiting",
        questionNumber: null,
        stage: null,
        stageEndsAt: "2026-08-06T04:30:00.000Z",
        question: null,
      }),
    );

    expect(screen.getByText("00:00:00").getAttribute("aria-live")).toBeNull();
  });

  it("limits live announcements to the question and answer status", () => {
    renderPanel(liveState());

    const prompt = screen.getByRole("heading", {
      name: "대한민국의 수도는 어디일까요?",
    });
    expect(prompt.getAttribute("aria-live")).toBe("polite");
    expect(prompt.closest("section")?.getAttribute("aria-live") ?? null).toBeNull();
    expect(
      screen
        .getByText("가장 알맞은 답 하나를 선택하세요.")
        .parentElement?.getAttribute("aria-live"),
    ).toBe("polite");
  });
});
