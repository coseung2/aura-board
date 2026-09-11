import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SongGuessSnapshot } from "@/lib/song-guess/contracts";
const mocks = vi.hoisted(() => ({ rooms: vi.fn(), catalog: vi.fn(), snapshot: vi.fn(), submit: vi.fn(), refresh: vi.fn(), create: vi.fn() }));
vi.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: ({ refresh }: { refresh: () => Promise<void> }) => mocks.refresh.mockImplementation(refresh) }));
vi.mock("@/lib/song-guess/browser-client", async (original) => ({ ...await original<typeof import("@/lib/song-guess/browser-client")>(), fetchSongGuessRooms: mocks.rooms, fetchSongGuessRoomCatalog: mocks.catalog, fetchSongGuessSnapshot: mocks.snapshot, submitSongGuessCommand: mocks.submit, createSongGuessRoom: mocks.create }));
vi.mock("./use-song-guess-sounds", () => ({ useSongGuessSounds: () => ({ unlock: vi.fn(), toggleMuted: vi.fn(), onMusicPlaying: vi.fn(), muted: false }) }));
vi.mock("./SongGuessScoreboard", () => ({ SongGuessScoreboard: () => <div>점수판</div>, SongGuessParticipantPet: () => null }));
import { SongGuessBoard } from "./SongGuessBoard";
import { SongGuessRooms } from "./song-guess-rooms";
function room(id = "room-1"): SongGuessSnapshot { return { sessionId: id, boardId: "board-1", gameKind: "song-guess", roomMode: "student-free", version: 1, serverTimeMs: 1000, rulesVersion: 2, stateSchemaVersion: 1, previousSessionId: null, phase: "lobby", currentRound: { roundId: "r1", order: 0, accessibilityClue: null, revealedAnswer: null, currentClip: null }, participants: [], viewer: { role: "participant", joined: true, scoredCurrentRound: false } }; }
async function enter() { render(<SongGuessBoard boardId="board-1" boardTitle="음악" viewer="student" />); fireEvent.click(await screen.findByRole("button", { name: /자유 게임 · 대기 중.*1번 방/ })); await screen.findByText("시작 대기"); }
describe("music room selection and exit", () => {
  beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); mocks.rooms.mockResolvedValue([room()]); mocks.catalog.mockResolvedValue([{ id: "pop", label: "가요", counts: { intro: 10, highlight: 10 } }]); mocks.snapshot.mockResolvedValue(room()); vi.spyOn(window, "confirm").mockReturnValue(true); });
  it("waits for an explicit room choice", async () => {
    render(<SongGuessBoard boardId="board-1" boardTitle="음악" viewer="student" />);
    await screen.findByRole("button", { name: /자유 게임 · 대기 중/ });
    expect(mocks.snapshot).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("keeps category settings and creation request id on retry", async () => {
    const onSelect = vi.fn(); mocks.create.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(room());
    render(<SongGuessRooms boardId="board-1" teacher={false} onSelect={onSelect} onTeacherSetup={vi.fn()} />);
    fireEvent.click(await screen.findByRole("radio", { name: "가요 (10)" }));
    fireEvent.click(screen.getByRole("button", { name: "방 만들기" })); await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "방 만들기" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("room-1"));
    expect(mocks.create.mock.calls[0][1]).toEqual(mocks.create.mock.calls[1][1]);
  });
  it("does not enter automatically and refreshes only the selected room", async () => {
    await enter(); mocks.rooms.mockResolvedValue([room("room-2"), room()]);
    await act(() => mocks.refresh());
    expect(mocks.snapshot.mock.calls.every(([id]) => id === "room-1")).toBe(true);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("keeps the selected room when leaving is cancelled", async () => {
    await enter(); vi.mocked(window.confirm).mockReturnValue(false); fireEvent.click(screen.getByRole("button", { name: "방 나가기" }));
    expect(screen.getByText("시작 대기")).toBeInTheDocument(); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("keeps a failed leave available for exact request retry", async () => {
    mocks.submit.mockRejectedValue(new TypeError("offline")); await enter(); fireEvent.click(screen.getByRole("button", { name: "방 나가기" }));
    await screen.findByRole("button", { name: "다시 보내기" });
    expect(screen.getByText("시작 대기")).toBeInTheDocument();
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
    expect(mocks.submit.mock.calls[0][1].requestId).toBe(mocks.submit.mock.calls[1][1].requestId);
    expect(mocks.submit.mock.calls[0][1].command.type).toBe("leave");
  });
  it("returns to the list after a successful leave without rejoining", async () => {
    mocks.submit.mockImplementation(async (_id, request) => ({ requestId: request.requestId, snapshot: { ...room(), version: 2, viewer: { ...room().viewer, joined: false } } }));
    await enter(); fireEvent.click(screen.getByRole("button", { name: "방 나가기" }));
    await screen.findByRole("heading", { name: "음악 퀴즈 방" }); expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
  it("allows retry after a room list error", async () => {
    mocks.rooms.mockRejectedValueOnce(new Error("offline")); render(<SongGuessRooms boardId="board-1" teacher={false} onSelect={vi.fn()} onTeacherSetup={vi.fn()} />);
    await screen.findByRole("alert"); fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    await screen.findByRole("button", { name: /자유 게임 · 대기 중/ });
  });
});
