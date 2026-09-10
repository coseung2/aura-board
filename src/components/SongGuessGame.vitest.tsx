import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SongGuessClipSnapshot, SongGuessSnapshot } from "@/lib/song-guess/contracts";
import { SongGuessGame } from "./SongGuessGame";

vi.mock("./SongGuessPlayer", () => ({
  SongGuessPlayer: ({
    teacher,
    clip,
  }: {
    teacher?: boolean;
    clip: SongGuessClipSnapshot;
  }) => (
    <div>
      음원 플레이어
      {teacher && clip.mimeType.startsWith("audio/") && (
        <div role="timer" aria-label="남은 응답 시간">플레이어 타이머</div>
      )}
    </div>
  ),
}));
vi.mock("./SongGuessScoreboard", () => ({ SongGuessScoreboard: () => <div>점수판</div> }));
vi.mock("./use-song-guess-sounds", () => ({ useSongGuessSounds: () => ({ unlock: vi.fn(), toggleMuted: vi.fn(), onMusicPlaying: vi.fn(), muted: false }) }));

function snapshot(): SongGuessSnapshot {
  return {
    sessionId: "session-1", boardId: "board-1", gameKind: "song-guess",
    version: 3, serverTimeMs: 1_000, rulesVersion: 1, stateSchemaVersion: 1,
    previousSessionId: null, phase: "guessing", answerMode: "multiple-choice",
    currentRound: {
      roundId: "round-1", order: 0, accessibilityClue: null, revealedAnswer: null, currentClip: null,
      choices: ["밤편지", "좋은 날", "달리반피카소", "봄날"].map((label, index) => ({ id: `option-${index}`, label })),
    },
    participants: [{ displayName: "학생", score: 0, scoredCurrentRound: false }],
    viewer: { role: "participant", scoredCurrentRound: false, joined: true, answeredCurrentRound: false, selectedChoiceId: null },
  };
}

function renderGame(state = snapshot(), overrides = {}) {
  const onIntent = vi.fn();
  const props = { snapshot: state, totalRounds: 10, canInteract: true, remainingSeconds: 20, expired: false,
    guessText: "", onGuessText: vi.fn(), onIntent, result: null, onReloadSetup: vi.fn(), status: null, ...overrides };
  return { ...render(<SongGuessGame {...props} />), onIntent, props };
}

describe("SongGuessGame answer modes", () => {
  it.each(["artist", "artist-title"] as const)("uses the persisted %s target for student prompts", (target) => {
    const state = snapshot();
    state.answerTarget = target;
    state.answerMode = "text";
    const { onIntent } = renderGame(state, { guessText: "아이유 - 밤편지" });
    expect(screen.getByRole("textbox", { name: target === "artist" ? "가수·작곡가" : "가수·작곡가 - 노래 제목" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "정답 제출" }));
    expect(onIntent).toHaveBeenCalledWith({ type: "guess", text: "아이유 - 밤편지" });
  });
  it("shows four choices and sends the opaque choice id with its round", () => {
    const { onIntent } = renderGame();
    expect(screen.queryByRole("textbox", { name: "노래 제목" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "노래 제목 보기" }).querySelectorAll("button")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "달리반피카소" }));
    expect(onIntent).toHaveBeenCalledWith({ type: "guess", choiceId: "option-2", roundId: "round-1" });
  });

  it("restores the submitted choice and locks all choices even after a wrong answer", () => {
    const state = snapshot();
    state.viewer.answeredCurrentRound = true;
    state.viewer.selectedChoiceId = "option-2";
    const { onIntent } = renderGame(state);
    expect(screen.getByRole("button", { name: /달리반피카소/ })).toHaveAttribute("aria-pressed", "true");
    for (const button of screen.getByRole("group").querySelectorAll("button")) expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "밤편지" }));
    expect(onIntent).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("답변 제출 완료");
  });

  it("marks the revealed correct choice separately from the participant's wrong selection", () => {
    const state = snapshot();
    state.phase = "reveal";
    state.currentRound.revealedAnswer = "밤편지";
    state.viewer.answeredCurrentRound = true;
    state.viewer.selectedChoiceId = "option-1";
    state.viewer.scoredCurrentRound = false;
    renderGame(state);
    expect(screen.getByRole("button", { name: /밤편지/ })).toHaveAttribute("data-result", "correct");
    expect(screen.getByRole("button", { name: /좋은 날/ })).toHaveAttribute("data-result", "wrong");
    expect(screen.getByRole("button", { name: /달리반피카소/ })).toHaveAttribute("data-result", "muted");
    expect(screen.getByLabelText("정답")).toBeInTheDocument();
    expect(screen.getByLabelText("제출한 오답")).toBeInTheDocument();
  });

  it.each([{ canInteract: false }, { expired: true }])("blocks choices while busy or expired: %j", (overrides) => {
    const { onIntent } = renderGame(snapshot(), overrides);
    fireEvent.click(screen.getByRole("button", { name: "밤편지" }));
    expect(onIntent).not.toHaveBeenCalled();
  });

  it("lets the host display choices without submitting a guess", () => {
    const state = snapshot();
    state.viewer.role = "host";
    const { onIntent } = renderGame(state);
    expect(screen.getByRole("button", { name: "밤편지" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "밤편지" }));
    expect(onIntent).not.toHaveBeenCalled();
  });

  it("does not encourage retrying a wrong multiple-choice answer", () => {
    renderGame(snapshot(), { result: { roundId: "round-1", tierMs: 500, correct: false, alreadyScored: false, score: 0 } });
    expect(screen.getByRole("status")).toHaveTextContent("정답 공개를 기다려 주세요");
    expect(screen.queryByText("다시 도전해 보세요.")).not.toBeInTheDocument();
  });

  it("keeps direct title input for legacy sessions without a mode", () => {
    const state = snapshot();
    delete state.answerMode;
    delete state.currentRound.choices;
    const { onIntent } = renderGame(state, { guessText: "달리반피카소" });
    expect(screen.queryByRole("group", { name: "노래 제목 보기" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "정답 제출" }));
    expect(onIntent).toHaveBeenCalledWith({ type: "guess", text: "달리반피카소" });
  });

  it.each([
    { label: "missing", clip: null },
    {
      label: "non-audio",
      clip: {
        assetId: "legacy-video",
        tierMs: 15000 as const,
        mimeType: "video/youtube" as const,
        durationMs: 15000,
        sizeBytes: 0,
      },
    },
  ])("keeps the teacher timer visible for a $label clip", ({ clip }) => {
    const state = snapshot();
    state.viewer.role = "host";
    state.currentRound.currentClip = clip;
    renderGame(state, { remainingSeconds: 17 });
    const timer = screen.getByRole("timer", { name: "남은 응답 시간" });
    expect(timer).toHaveTextContent("17");
  });

  it("renders only the player timer for a teacher audio clip", () => {
    const state = snapshot();
    state.viewer.role = "host";
    state.currentRound.currentClip = {
      assetId: "audio-clip",
      tierMs: 15000,
      mimeType: "audio/wav",
      durationMs: 15000,
      sizeBytes: 100,
    };
    renderGame(state, { remainingSeconds: 17 });
    expect(screen.getAllByRole("timer", { name: "남은 응답 시간" })).toHaveLength(1);
    expect(screen.getByRole("timer", { name: "남은 응답 시간" })).toHaveTextContent(
      "플레이어 타이머",
    );
  });
});
