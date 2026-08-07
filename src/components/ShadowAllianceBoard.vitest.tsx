import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAY_SESSION_CHANGED_EVENT } from "@/lib/realtime";
import { ShadowAllianceBoard } from "./ShadowAllianceBoard";

const mocks = vi.hoisted(() => ({
  realtime: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/hooks/useRealtimeInvalidation", () => ({
  useRealtimeInvalidation: mocks.realtime,
}));

const snapshot = {
  id: "session-1",
  boardId: "board-1",
  classroomId: "classroom-1",
  version: 2,
  phase: "lobby" as const,
  terminalReason: null,
  round: 0,
  totalRounds: 5,
  command: null,
  editable: true,
  timeLeftMs: 0,
  timerRunning: false,
  startedAt: null,
  completedAt: null,
  participants: [
    {
      studentId: "student-1",
      name: "그림자 1",
      team: "black" as const,
      joinedAt: 1,
      readyAt: 2,
      forfeitedAt: null,
      power: 0,
      lastGain: 0,
      roundWins: 0,
      submitted: false,
      isSelf: false,
    },
    {
      studentId: "student-2",
      name: "그림자 2",
      team: "white" as const,
      joinedAt: 1,
      readyAt: 2,
      forfeitedAt: null,
      power: 0,
      lastGain: 0,
      roundWins: 0,
      submitted: false,
      isSelf: false,
    },
  ],
  lastResult: null,
  allSubmitted: false,
};

afterEach(() => {
  cleanup();
  mocks.realtime.mockReset();
  mocks.push.mockReset();
  vi.unstubAllGlobals();
});

describe("ShadowAllianceBoard legacy presentation adapter", () => {
  it("renders the pre-platform command-center UI and uses realtime invalidation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ snapshot }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    render(
      <ShadowAllianceBoard
        boardId="board-1"
        boardTitle="그림자연합"
        viewer="teacher"
      />,
    );

    expect(await screen.findByText("교사 본부")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "그림자연합" })).toBeTruthy();
    expect(screen.getByText("게임 설명")).toBeTruthy();
    expect(screen.queryByText("Lobby")).toBeNull();

    await waitFor(() => {
      expect(mocks.realtime).toHaveBeenCalledWith(
        expect.objectContaining({
          channelName: "board:board-1",
          event: PLAY_SESSION_CHANGED_EVENT,
          fallbackPollMs: 10_000,
        }),
      );
    });
  });

  it("renders the restored student UI and auto-joins", async () => {
    const studentSnapshot = {
      ...snapshot,
      participants: [
        {
          ...snapshot.participants[0],
          isSelf: true,
          joinedAt: null,
          readyAt: null,
        },
        snapshot.participants[1],
      ],
    };
    const joinedSnapshot = {
      ...studentSnapshot,
      version: 3,
      participants: [
        {
          ...studentSnapshot.participants[0],
          joinedAt: 10,
          readyAt: 11,
        },
        studentSnapshot.participants[1],
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ snapshot: studentSnapshot }), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string };
        if (body.action === "join" || body.action === "ready") {
          return new Response(JSON.stringify({ snapshot: joinedSnapshot }), {
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ snapshot: joinedSnapshot }), {
          headers: { "content-type": "application/json" },
        });
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ShadowAllianceBoard
        boardId="board-1"
        boardTitle="그림자연합"
        viewer="student"
      />,
    );

    expect(await screen.findByText("대기 중")).toBeTruthy();
    expect(screen.getByText(/본부의 지령을 기다리는 중입니다/)).toBeTruthy();
    expect(screen.queryByText("그림자 1")).toBeNull();
    expect(screen.queryByText("그림자 2")).toBeNull();
    expect(screen.queryByText("블랙 연합")).toBeNull();
    expect(screen.queryByText("화이트 연합")).toBeNull();

    const nicknamePeek = screen.getByRole("button", {
      name: "내 닉네임, 누르고 있는 동안 공개",
    });
    fireEvent.pointerDown(nicknamePeek);
    expect(screen.getByText("그림자 1")).toBeTruthy();
    fireEvent.pointerUp(nicknamePeek);
    expect(screen.queryByText("그림자 1")).toBeNull();

    expect(screen.getByRole("button", { name: "게임 목록" })).toBeTruthy();
    expect(screen.queryByText("교사가 게임을 시작하면 첫 지령이 도착합니다.")).toBeNull();
    expect(screen.queryByText("Lobby")).toBeNull();
    expect(screen.queryByText("교사 본부")).toBeNull();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/shadow-alliance/boards/board-1",
        expect.objectContaining({
          method: "PATCH",
        }),
      );
    });
  });

  it("optimistically flips the editable toggle before the server responds", async () => {
    let resolveSettings!: (value: Response) => void;
    const settingsResponse = new Promise<Response>((resolve) => {
      resolveSettings = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ snapshot }), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockImplementationOnce(() => settingsResponse);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ShadowAllianceBoard
        boardId="board-1"
        boardTitle="그림자연합"
        viewer="teacher"
      />,
    );

    const checkbox = await screen.findByRole("checkbox", {
      name: "제출 뒤 숫자 수정 허용",
    });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    resolveSettings(
      new Response(
        JSON.stringify({
          snapshot: { ...snapshot, version: 3, editable: false },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await waitFor(() => {
      expect((checkbox as HTMLInputElement).checked).toBe(false);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("silently adopts the latest snapshot when a settings toggle conflicts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ snapshot }), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "version_conflict",
            snapshot: { ...snapshot, version: 3, editable: false },
          }),
          {
            status: 409,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ShadowAllianceBoard
        boardId="board-1"
        boardTitle="그림자연합"
        viewer="teacher"
      />,
    );

    const checkbox = await screen.findByRole("checkbox", {
      name: "제출 뒤 숫자 수정 허용",
    });
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect((checkbox as HTMLInputElement).checked).toBe(false);
    });
    expect(
      screen.queryByText("다른 기기에서 상태가 바뀌어 최신 게임을 반영했어요."),
    ).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("pauses a running timer before leaving to continue later", async () => {
    const playingSnapshot = {
      ...snapshot,
      version: 7,
      phase: "playing" as const,
      round: 1,
      command: 50,
      timeLeftMs: 120_000,
      timerRunning: true,
      startedAt: Date.now() - 10_000,
    };
    const pausedSnapshot = {
      ...playingSnapshot,
      version: 8,
      timerRunning: false,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ snapshot: playingSnapshot }), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ snapshot: pausedSnapshot }), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ShadowAllianceBoard
        boardId="board-1"
        boardTitle="그림자연합"
        viewer="teacher"
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "다음에 이어하기" }),
    );

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ action: "pause" });
  });

  it("stays in the game when the authoritative end command fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ snapshot }), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "play_engine_unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ snapshot }), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <ShadowAllianceBoard
        boardId="board-1"
        boardTitle="그림자연합"
        viewer="teacher"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "게임 종료" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("leaves when a failed end response is reconciled as already ended", async () => {
    const endedSnapshot = {
      ...snapshot,
      version: 7,
      phase: "host-ended" as const,
      terminalReason: "host_ended",
      completedAt: Date.now(),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ snapshot }), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "domain_rejected", detail: "session_terminal" }),
          {
            status: 422,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ snapshot: endedSnapshot }), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <ShadowAllianceBoard
        boardId="board-1"
        boardTitle="그림자연합"
        viewer="teacher"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "게임 종료" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("leaves only after the authoritative end command succeeds", async () => {
    const endedSnapshot = {
      ...snapshot,
      version: 3,
      phase: "host-ended" as const,
      terminalReason: "host_ended",
      completedAt: Date.now(),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ snapshot }), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ snapshot: endedSnapshot }), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <ShadowAllianceBoard
        boardId="board-1"
        boardTitle="그림자연합"
        viewer="teacher"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "게임 종료" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ action: "end-early" });
  });
});
