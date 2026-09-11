import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SongGuessSnapshot, SongGuessTeacherSetup } from "@/lib/song-guess/contracts";
import { SongGuessClientError } from "@/lib/song-guess/browser-client";

const mocks = vi.hoisted(() => ({
  fetchCurrent: vi.fn(),
  fetchSetup: vi.fn(),
  submitCommand: vi.fn(),
  createSession: vi.fn(),
  saveSetup: vi.fn(),
  deleteSetup: vi.fn(),
  uploadClip: vi.fn(),
  deleteClip: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/hooks/useRealtimeInvalidation", () => ({
  useRealtimeInvalidation: ({ refresh }: { refresh: () => Promise<void> }) => {
    mocks.refresh.mockImplementation(refresh);
  },
}));

vi.mock("@/lib/song-guess/browser-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/song-guess/browser-client")>();
  return {
    ...original,
    fetchSongGuessSnapshot: mocks.fetchCurrent,
    fetchSongGuessTeacherSetup: mocks.fetchSetup,
    submitSongGuessCommand: mocks.submitCommand,
    createSongGuessSession: mocks.createSession,
    saveSongGuessTeacherSetup: mocks.saveSetup,
    deleteSongGuessTeacherSetup: mocks.deleteSetup,
    uploadSongGuessClip: mocks.uploadClip,
    deleteSongGuessClip: mocks.deleteClip,
  };
});

// These existing gameplay tests enter a chosen room; room discovery is covered separately.
vi.mock("./song-guess-rooms", async () => {
  const { useEffect } = await import("react");
  return { SongGuessRooms: ({ onSelect, onTeacherSetup }: { onSelect: (id: string) => void; onTeacherSetup: () => void }) => {
    useEffect(() => {
      void Promise.resolve(mocks.fetchCurrent.getMockImplementation()?.()).then((value) => {
        if (value) onSelect(value.sessionId); else onTeacherSetup();
      });
    }, []);
    return null;
  } };
});

import { SongGuessBoard } from "./SongGuessBoard";

function snapshot(
  role: "host" | "participant",
  overrides: Partial<SongGuessSnapshot> = {},
): SongGuessSnapshot {
  return {
    sessionId: "session-1",
    boardId: "board-1",
    gameKind: "song-guess",
    version: 2,
    serverTimeMs: 1_000,
    rulesVersion: 1,
    stateSchemaVersion: 1,
    previousSessionId: null,
    phase: "guessing",
    currentRound: {
      roundId: "round-1",
      order: 0,
      accessibilityClue: "리듬 단서",
      revealedAnswer: null,
      currentClip: {
        assetId: "asset-current-500",
        tierMs: 500,
        mimeType: "audio/wav",
        durationMs: 500,
        sizeBytes: 44_144,
      },
    },
    participants: [{ displayName: "학생", score: 0, scoredCurrentRound: false }],
    viewer: { role, scoredCurrentRound: false },
    ...overrides,
  };
}

function setup(): SongGuessTeacherSetup {
  return {
    id: "setup-1",
    boardId: "board-1",
    rounds: [
      {
        id: "round-1",
        order: 0,
        representativeAnswer: "비밀 정답",
        aliases: ["별칭"],
        accessibilityClue: "리듬 단서",
        clips: [500, 1000, 1500].map((tierMs) => ({
          id: `asset-${tierMs}`,
          tierMs: tierMs as 500 | 1000 | 1500,
          mimeType: "audio/wav" as const,
          durationMs: tierMs,
          sizeBytes: 100,
        })),
      },
    ],
  };
}

describe("SongGuessBoard authoritative web flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.fetchSetup.mockResolvedValue(setup());
    mocks.fetchCurrent.mockResolvedValue(null);
    mocks.submitCommand.mockImplementation(async (_sessionId, request) => ({
      requestId: request.requestId,
      previousVersion: request.expectedVersion,
      version: request.expectedVersion + 1,
      snapshot: snapshot("host", { version: request.expectedVersion + 1 }),
      result: null,
    }));
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it.each(["text", "multiple-choice"] as const)("creates a game using the selected %s answer mode", async (answerMode) => {
    mocks.createSession.mockResolvedValue({ snapshot: snapshot("host", { phase: "lobby", answerMode }) });
    render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="teacher" />);
    const textMode = await screen.findByRole("radio", { name: "서술형" });
    expect(textMode).toBeChecked();
    if (answerMode === "multiple-choice") fireEvent.click(screen.getByRole("radio", { name: "객관식 (4지선다)" }));
    fireEvent.click(screen.getByRole("button", { name: "게임 만들기" }));
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledWith("board-1", answerMode, "title"));
    await screen.findByText("시작 대기");
  });

  it.each(["artist", "artist-title"] as const)("sends the selected %s creation target independently of answer mode", async (target) => {
    mocks.createSession.mockResolvedValue({ snapshot: snapshot("host", { phase: "lobby", answerTarget: target }) });
    render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="teacher" />);
    fireEvent.change(await screen.findByRole("combobox", { name: "출제 모드" }), { target: { value: target } });
    fireEvent.click(screen.getByRole("radio", { name: "객관식 (4지선다)" }));
    fireEvent.click(screen.getByRole("button", { name: "게임 만들기" }));
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledWith("board-1", "multiple-choice", target));
  });

  it("reviews an automatically prepared pack before creating it with the selected settings", async () => {
    mocks.fetchSetup.mockResolvedValue(null);
    const prepared = setup();
    const catalog = {
      categories: [
        { id: "k-pop", label: "가요", counts: { intro: 1, highlight: 1 } },
      ],
      songs: [
        {
          id: "song-1",
          title: "비밀 정답",
          artist: "가수",
          aliases: ["별칭"],
          categories: ["k-pop"],
          sourceUrl: null,
          segments: { intro: true, highlight: true },
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(catalog), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ setup: prepared }), { status: 201 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    mocks.createSession.mockResolvedValue({
      snapshot: snapshot("host", {
        phase: "lobby",
        answerMode: "multiple-choice",
        answerTarget: "artist-title",
      }),
    });

    render(
      <SongGuessBoard
        boardId="board-1"
        boardTitle="우리 반 음악"
        viewer="teacher"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "1문제 준비하기" }));
    const guideButton = await screen.findByRole("button", {
      name: "교사용 정답 목록",
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
    fireEvent.click(guideButton);
    expect(screen.getByText("비밀 정답")).toBeVisible();
    fireEvent.change(screen.getByRole("combobox", { name: "출제 모드" }), {
      target: { value: "artist-title" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "객관식 (4지선다)" }));
    fireEvent.click(screen.getByRole("button", { name: "게임 만들기" }));

    await waitFor(() =>
      expect(mocks.createSession).toHaveBeenCalledWith(
        "board-1",
        "multiple-choice",
        "artist-title",
      ),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/song-guess/boards/board-1/catalog",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps the selected creation settings available after a creation failure", async () => {
    mocks.createSession
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce({
        snapshot: snapshot("host", {
          phase: "lobby",
          answerMode: "multiple-choice",
          answerTarget: "artist",
        }),
      });
    render(
      <SongGuessBoard
        boardId="board-1"
        boardTitle="우리 반 음악"
        viewer="teacher"
      />,
    );
    fireEvent.change(await screen.findByRole("combobox", { name: "출제 모드" }), {
      target: { value: "artist" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "객관식 (4지선다)" }));
    fireEvent.click(screen.getByRole("button", { name: "게임 만들기" }));
    expect(await screen.findByRole("alert")).toBeVisible();

    const retry = screen.getByRole("button", { name: "게임 만들기" });
    expect(retry).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "출제 모드" })).toHaveValue("artist");
    expect(screen.getByRole("radio", { name: "객관식 (4지선다)" })).toBeChecked();
    fireEvent.click(retry);

    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(2));
    expect(mocks.createSession).toHaveBeenNthCalledWith(
      2,
      "board-1",
      "multiple-choice",
      "artist",
    );
    await screen.findByText("시작 대기");
  });

  it("shows validation feedback when saving the initial empty manual draft", async () => {
    mocks.fetchSetup.mockResolvedValue(null);
    render(
      <SongGuessBoard
        boardId="board-1"
        boardTitle="우리 반 음악"
        viewer="teacher"
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "직접 음원 구성" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "라운드 팩 저장" }));

    expect(
      await screen.findByText("모든 라운드의 대표 정답을 입력해 주세요."),
    ).toHaveAttribute("role", "alert");
    expect(mocks.saveSetup).not.toHaveBeenCalled();
  });

  it.each([null, "draft", "guessing"] as const)("lets teachers inspect saved answers in %s without revealing them to the game", async (phase) => {
    mocks.fetchCurrent.mockResolvedValue(phase ? snapshot("host", { phase }) : null);
    render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="teacher" />);
    const button = await screen.findByRole("button", { name: "교사용 정답 목록" });
    expect(screen.queryByText("비밀 정답")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByText("비밀 정답")).toBeVisible();
    expect(screen.getByText("별칭")).toBeVisible();
    expect(screen.getByText(/영어 대소문자와 앞뒤 공백/)).toBeVisible();
    if (phase) expect(screen.getByText("현재 문제")).toBeVisible();
    expect(mocks.submitCommand).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "교사용 정답 목록 닫기" }));
    expect(screen.queryByText("비밀 정답")).not.toBeInTheDocument();
  });

  it("keeps heading and answer input stable during a delayed background refresh", async () => {
    const current = snapshot("participant");
    mocks.fetchCurrent.mockResolvedValue(current);
    const { container } = render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="student" />);
    const input = await screen.findByPlaceholderText("정답 입력");
    input.focus();
    fireEvent.change(input, { target: { value: "작성 중인 답" } });
    const heading = container.querySelector("header")!.outerHTML;
    let finish!: (value: SongGuessSnapshot) => void;
    mocks.fetchCurrent.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    act(() => { void mocks.refresh(); });
    expect(container.querySelector("header")!.outerHTML).toBe(heading);
    expect(input).toBeEnabled();
    expect(input).toHaveFocus();
    expect(input).toHaveValue("작성 중인 답");
    expect(screen.getByRole("button", { name: "정답 제출" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "교사용 정답 목록" })).not.toBeInTheDocument();
    await act(async () => { finish(current); });
    expect(input).toHaveValue("작성 중인 답");
  });

  it("automatically joins the opened board and shows only the server-acknowledged entrance", async () => {
    const lobby = snapshot("participant", {
      phase: "lobby",
      participants: [{ participantId: "student-1", displayName: "하늘", score: 0, scoredCurrentRound: false, joined: false }],
      viewer: { role: "participant", scoredCurrentRound: false, joined: false, participantIndex: 0 },
    });
    mocks.fetchCurrent.mockResolvedValue(lobby);
    mocks.submitCommand.mockImplementation(async (_id, request) => ({ requestId: request.requestId, previousVersion: 2, version: 3,
      snapshot: { ...lobby, version: 3, participants: [{ ...lobby.participants[0], joined: true }], viewer: { ...lobby.viewer, joined: true } }, result: null }));
    render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="student" />);
    expect(await screen.findByText("입장 완료")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "입장하기" })).not.toBeInTheDocument();
    expect(mocks.submitCommand).toHaveBeenCalledTimes(1);
    expect(mocks.submitCommand).toHaveBeenCalledWith("session-1", expect.objectContaining({ command: { type: "join" } }));
    expect(screen.queryByRole("button", { name: "음악 퀴즈 시작" })).not.toBeInTheDocument();
  });

  it.each([403, 429])("allows explicit retry after a %s join rejection without an automatic retry loop", async (status) => {
    const lobby = snapshot("participant", {
      phase: "lobby",
      participants: [{ displayName: "하늘", score: 0, scoredCurrentRound: false, joined: false }],
      viewer: { role: "participant", scoredCurrentRound: false, joined: false, participantIndex: 0 },
    });
    mocks.fetchCurrent.mockResolvedValue(lobby);
    mocks.submitCommand.mockImplementation(async (_id, request) => ({
      requestId: request.requestId, previousVersion: 2, version: 3,
      snapshot: { ...lobby, version: 3, participants: [{ ...lobby.participants[0], joined: true }], viewer: { ...lobby.viewer, joined: true } }, result: null,
    })).mockRejectedValueOnce(new SongGuessClientError(status, { error: "join_rejected" }))
      .mockRejectedValueOnce(new SongGuessClientError(status, { error: "join_rejected" }));

    render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="student" />);
    expect(await screen.findByText("입장하지 못했어요")).toBeInTheDocument();
    expect(mocks.submitCommand).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "최신 상태 확인" }));
    await waitFor(() => expect(mocks.fetchCurrent).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "다시 시도" })).toBeEnabled());
    expect(screen.getByText("입장하지 못했어요")).toBeInTheDocument();
    expect(mocks.submitCommand).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("입장하지 못했어요")).toBeInTheDocument();
    expect(mocks.submitCommand).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("입장 완료")).toBeInTheDocument();
    expect(mocks.submitCommand).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });

  it("preserves a pending choice after a lost response and retries the same request", async () => {
    const state = snapshot("participant", { answerMode: "multiple-choice" });
    state.currentRound.choices = ["봄날", "밤편지", "좋은 날", "달리반피카소"].map((label, i) => ({ id: `option-${i}`, label }));
    mocks.fetchCurrent.mockResolvedValue(state);
    mocks.submitCommand.mockRejectedValue(new TypeError("Network request failed"));
    render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="student" />);
    fireEvent.click(await screen.findByRole("button", { name: "밤편지" }));
    await waitFor(() => expect(mocks.submitCommand).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "다시 보내기" })).toBeEnabled());
    const firstRequest = mocks.submitCommand.mock.calls[0][1];
    expect(mocks.submitCommand.mock.calls[1][1]).toEqual(firstRequest);
    expect(screen.getByRole("button", { name: "좋은 날" })).toBeDisabled();
    expect(JSON.parse(window.localStorage.getItem("aura-song-guess-pending:board-1")!).request).toEqual(firstRequest);
    mocks.submitCommand.mockImplementation(async (_id, request) => ({
      requestId: request.requestId, previousVersion: 2, version: 3, result: null,
      snapshot: { ...state, version: 3, viewer: { ...state.viewer, answeredCurrentRound: true, selectedChoiceId: "option-1" } },
    }));
    fireEvent.click(screen.getByRole("button", { name: "다시 보내기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /밤편지/ })).toHaveAttribute("aria-pressed", "true"));
    expect(mocks.submitCommand.mock.calls[2][1]).toEqual(firstRequest);
    expect(window.localStorage.getItem("aura-song-guess-pending:board-1")).toBeNull();
  });

  it("reports a missing audio file for a legacy video-only round without loading a provider", async () => {
    mocks.fetchCurrent.mockResolvedValue(snapshot("participant", { currentRound: { roundId: "youtube-round", order: 0,
      accessibilityClue: null, revealedAnswer: null, currentClip: { assetId: "opaque-video", tierMs: 15000, mimeType: "video/youtube", durationMs: 15000, sizeBytes: 0 } } }));
    const { container } = render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="student" />);
    expect(await screen.findByText("음원 파일이 없는 문제예요.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("정답 입력")).toBeEnabled();
    expect(container.querySelector("iframe, audio")).toBeNull();
  });

  it("shows the round's earned points and ranking in the main result area", async () => {
    mocks.fetchCurrent.mockResolvedValue(snapshot("participant", { phase: "reveal", participants: [
      { displayName: "하늘", score: 1400, roundScore: 800, previousRank: 2, scoredCurrentRound: true },
      { displayName: "별", score: 1200, roundScore: 400, previousRank: 1, scoredCurrentRound: true },
    ] }));
    render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="student" />);
    expect(await screen.findByRole("heading", { name: "라운드 순위" })).toBeInTheDocument();
    expect(screen.getByText("+800")).toBeInTheDocument();
    expect(screen.getByLabelText("1위 상승")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("locks teacher editing whenever a current authoritative session exists", async () => {
    mocks.fetchCurrent.mockResolvedValue(snapshot("host", {
      phase: "draft",
      currentRound: {
        roundId: "round-1",
        order: 0,
        accessibilityClue: null,
        revealedAnswer: null,
        currentClip: null,
      },
    }));

    render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="teacher" />);

    expect(await screen.findByRole("button", { name: "로비 열기" })).toBeInTheDocument();
    expect(screen.queryByText("라운드 음원 준비")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "노래 풀" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "직접 음원 구성" })).not.toBeInTheDocument();
  });

  it("blocks reveal progression until a failed teacher setup reload recovers", async () => {
    mocks.fetchCurrent.mockResolvedValue(snapshot("host", { phase: "reveal" }));
    mocks.fetchSetup.mockRejectedValue(new Error("setup_unavailable"));

    render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="teacher" />);

    const progression = await screen.findByRole("button", {
      name: "라운드 구성 확인 필요",
    });
    expect(progression).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "라운드 구성 다시 불러오기" }),
    ).toBeInTheDocument();
    expect(mocks.submitCommand).not.toHaveBeenCalled();
  });

  it("renders only the currently unlocked clip URL and never student answer data", async () => {
    mocks.fetchCurrent.mockResolvedValue(snapshot("participant"));

    const { container } = render(
      <SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="student" />,
    );

    const audio = await screen.findByLabelText("0.5초 음악 클립");
    expect(audio).toHaveAttribute(
      "src",
      "/api/song-guess/sessions/session-1/clips/asset-current-500",
    );
    expect(container.innerHTML).not.toContain("asset-future-1000");
    expect(container.innerHTML).not.toContain("비밀 정답");
    expect(mocks.fetchSetup).not.toHaveBeenCalled();
  });

  it("shows the authoritative answer to students only in the reveal phase", async () => {
    mocks.fetchCurrent.mockResolvedValue(snapshot("participant", {
      phase: "reveal",
      currentRound: {
        roundId: "round-1",
        order: 0,
        accessibilityClue: "리듬 단서",
        revealedAnswer: "비밀 정답",
        currentClip: null,
      },
    }));

    render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="student" />);

    expect(await screen.findByRole("heading", { name: "비밀 정답" })).toBeInTheDocument();
    expect(mocks.fetchSetup).not.toHaveBeenCalled();
  });

  it("shows the server-awarded score after a correct participant command", async () => {
    const before = snapshot("participant");
    const after = snapshot("participant", {
      version: 3,
      participants: [{ displayName: "학생", score: 1000, scoredCurrentRound: true }],
      viewer: { role: "participant", scoredCurrentRound: true },
    });
    mocks.fetchCurrent.mockResolvedValue(before);
    mocks.submitCommand.mockImplementation(async (_sessionId, request) => ({
      requestId: request.requestId,
      previousVersion: 2,
      version: 3,
      snapshot: after,
      result: {
        roundId: "round-1",
        tierMs: 500,
        correct: true,
        alreadyScored: false,
        score: 1000,
      },
    }));

    render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="student" />);
    fireEvent.change(await screen.findByPlaceholderText("정답 입력"), {
      target: { value: "비밀 정답" },
    });
    fireEvent.click(screen.getByRole("button", { name: "정답 제출" }));

    expect(await screen.findByText("정답! +1000점")).toBeInTheDocument();
    expect(screen.getByText("1000점")).toBeInTheDocument();
  });

  it("retries an unacknowledged command with the exact stored request identity", async () => {
    const current = snapshot("participant");
    const pending = {
      sessionId: current.sessionId,
      request: {
        requestId: "stored-request-id",
        expectedVersion: current.version,
        commandSchemaVersion: 1 as const,
        command: { type: "guess" as const, text: "비밀 정답" },
      },
    };
    window.localStorage.setItem(
      "aura-song-guess-pending:board-1",
      JSON.stringify(pending),
    );
    mocks.fetchCurrent.mockResolvedValue(current);
    mocks.submitCommand.mockResolvedValue({
      requestId: pending.request.requestId,
      previousVersion: 2,
      version: 3,
      snapshot: snapshot("participant", { version: 3 }),
      result: null,
    });

    render(<SongGuessBoard boardId="board-1" boardTitle="우리 반 음악" viewer="student" />);

    await waitFor(() => {
      expect(mocks.submitCommand).toHaveBeenCalledWith("session-1", pending.request);
    });
    expect(window.localStorage.getItem("aura-song-guess-pending:board-1")).toBeNull();
  });
});
