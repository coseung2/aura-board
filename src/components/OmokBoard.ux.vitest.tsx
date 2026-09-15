import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OmokSnapshot } from "@/lib/play-platform/contracts";
const mocks = vi.hoisted(() => ({
  current: vi.fn(), submit: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn(),
  matchmaking: vi.fn(), requestMatchmaking: vi.fn(), releaseMatchmaking: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: ({ refresh, enabled }: { refresh: () => Promise<void>; enabled: boolean }) => { if (enabled) mocks.refresh.mockImplementation(refresh); } }));
vi.mock("@/features/games/hooks/useGamePresence", () => ({
  useGamePresence: () => [{ studentId: "student-1", name: "학생", joinedAt: "2026-09-15T00:00:00.000Z" }],
}));
vi.mock("@/lib/play-platform/browser-client", async (original) => ({
  ...await original<typeof import("@/lib/play-platform/browser-client")>(),
  fetchCurrentOmokSession: mocks.current, submitOmokCommand: mocks.submit,
  fetchOmokMatchmaking: mocks.matchmaking,
  requestOmokMatch: mocks.requestMatchmaking,
  releaseOmokMatchBestEffort: mocks.releaseMatchmaking,
  fetchOmokPlayerProfiles: async () => ({ players: [], startedAtMs: null }),
}));
vi.mock("@/features/games/components/GameParticipantPet", () => ({ GameParticipantPet: () => null }));
import { OmokBoard } from "./OmokBoard";
function state(): OmokSnapshot {
  return { sessionId: "s", boardId: "b", gameKind: "omok", version: 1, serverTimeMs: 1000,
    rulesVersion: 1, stateSchemaVersion: 1, previousSessionId: null, roomStatus: "active",
    participants: [{ slot: "first", displayName: "흑", ready: true }, { slot: "second", displayName: "백", ready: true }],
    viewer: { role: "participant", slot: "first", capabilities: { canRematch: false } },
    game: { board: Array(225).fill(null), nextTurn: "first", status: { status: "playing" }, moveCount: 0, lastMove: null }, outcome: null };
}
beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
  mocks.current.mockResolvedValue(state());
  mocks.matchmaking.mockResolvedValue({ status: "idle", playerCount: 0, rooms: [] });
  mocks.requestMatchmaking.mockResolvedValue({ status: "waiting", playerCount: 1, queueKind: "random", rooms: [] });
  vi.spyOn(window, "confirm").mockReturnValue(false);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });
describe("Omok task-focused controls", () => {
  it("keeps the board interactive during routine reconciliation without status noise", async () => {
    render(<OmokBoard boardId="b" boardTitle="오목" viewer="student" />);
    const cell = (await screen.findAllByRole("gridcell"))[0];
    expect(cell).toBeEnabled();
    expect(screen.queryByText("실시간 연결")).toBeNull();
    expect(screen.queryByRole("button", { name: "최신 상태 확인" })).toBeNull();
    expect(screen.queryByText("준비됨")).toBeNull();
    let resolve!: (value: OmokSnapshot) => void;
    mocks.current.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    act(() => { void mocks.refresh(); });
    expect(cell).toBeEnabled();
    expect(screen.queryByText("동기화 중")).toBeNull();
    await act(async () => resolve(state()));
  });
  it("requires confirmation before resignation and sends no command on cancel", async () => {
    mocks.submit.mockImplementation(async (_id, request) => ({ requestId: request.requestId, snapshot: state() }));
    render(<OmokBoard boardId="b" boardTitle="오목" viewer="student" />);
    fireEvent.click(await screen.findByRole("button", { name: "기권하기" }));
    expect(mocks.submit).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "기권하기" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.submit.mock.calls[0][1].command.type).toBe("resign");
  });
  it("locks new moves while an acknowledgement is missing but retains recovery", async () => {
    mocks.submit.mockRejectedValue(new TypeError("network"));
    render(<OmokBoard boardId="b" boardTitle="오목" viewer="student" />);
    fireEvent.click((await screen.findAllByRole("gridcell"))[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: "미확인 요청 다시 보내기" })).toBeEnabled());
    expect(screen.getAllByRole("gridcell")[1]).toBeDisabled();
    const previous = mocks.submit.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "미확인 요청 다시 보내기" }));
    await waitFor(() => expect(mocks.submit.mock.calls.length).toBeGreaterThan(previous));
    expect(mocks.submit.mock.calls[0][1]).toEqual(mocks.submit.mock.calls.at(-1)![1]);
  });
  it("releases a waiting matchmaking lease when the student leaves the lobby", async () => {
    const view = render(<OmokBoard boardId="b" boardTitle="오목" viewer="student" matchmakingEnabled student={{ id: "student-1", name: "학생" }} />);
    expect(await screen.findByText("현재 오목 로비 접속 1명")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "랜덤 매칭" }));
    await waitFor(() => expect(screen.getByText("입장 대기 중")).toBeTruthy());

    view.unmount();

    expect(mocks.releaseMatchmaking).toHaveBeenCalledWith("b");
  });

  it.each(["teacher", "student"] as const)("returns the finished %s to its own game hub and respects rematch capability", async (viewer) => {
    const ended = state(); ended.roomStatus = "finished";
    ended.viewer.role = viewer === "teacher" ? "host" : "participant";
    mocks.current.mockResolvedValue(ended);
    render(<OmokBoard boardId="b" boardTitle="오목" viewer={viewer} />);
    fireEvent.click(await screen.findByRole("button", { name: "게임 목록" }));
    expect(mocks.push).toHaveBeenCalledWith(viewer === "teacher" ? "/dashboard?category=play" : "/student/boards?category=play");
    expect(screen.queryByRole("button", { name: "자리 바꿔 재대국" })).toBeNull();
    expect(screen.getAllByRole("gridcell")[0]).toBeDisabled();
  });
});
