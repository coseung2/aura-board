import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SongGuessSnapshot, SongGuessTeacherSetup } from "@/lib/song-guess/contracts";

const mocks = vi.hoisted(() => ({
  fetchCurrent: vi.fn(),
  fetchSetup: vi.fn(),
  submitCommand: vi.fn(),
  createSession: vi.fn(),
  saveSetup: vi.fn(),
  deleteSetup: vi.fn(),
  uploadClip: vi.fn(),
  deleteClip: vi.fn(),
}));

vi.mock("@/hooks/useRealtimeInvalidation", () => ({
  useRealtimeInvalidation: () => undefined,
}));

vi.mock("@/lib/song-guess/browser-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/song-guess/browser-client")>();
  return {
    ...original,
    fetchCurrentSongGuessSession: mocks.fetchCurrent,
    fetchSongGuessTeacherSetup: mocks.fetchSetup,
    submitSongGuessCommand: mocks.submitCommand,
    createSongGuessSession: mocks.createSession,
    saveSongGuessTeacherSetup: mocks.saveSetup,
    deleteSongGuessTeacherSetup: mocks.deleteSetup,
    uploadSongGuessClip: mocks.uploadClip,
    deleteSongGuessClip: mocks.deleteClip,
  };
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
    expect(screen.getByText("세션이 존재하는 동안 라운드 편집은 잠깁니다.")).toBeInTheDocument();
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

    expect(await screen.findByText("정답! 서버가 1000점을 반영했어요.")).toBeInTheDocument();
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
