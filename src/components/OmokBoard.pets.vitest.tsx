import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OmokPlayerProfile, OmokSnapshot } from "@/lib/play-platform/contracts";

const mocks = vi.hoisted(() => ({ current: vi.fn(), profiles: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: vi.fn() }));
vi.mock("@/lib/play-platform/browser-client", async (original) => ({
  ...await original<typeof import("@/lib/play-platform/browser-client")>(),
  fetchCurrentOmokSession: mocks.current, fetchOmokPlayerProfiles: mocks.profiles,
}));
vi.mock("@/features/games/components/GameParticipantPet", () => ({
  GameParticipantPet: ({ name, pet, size }: { name: string; pet: unknown; size: number }) => (
    <span role="img" aria-label={`${name} 대표펫`} data-pet={JSON.stringify(pet)} data-size={size} />
  ),
}));
import { OmokBoard } from "./OmokBoard";

function snapshot(sessionId: string): OmokSnapshot {
  return {
    sessionId, boardId: "board", gameKind: "omok", version: 0, serverTimeMs: 0,
    rulesVersion: 1, stateSchemaVersion: 1, previousSessionId: null, roomStatus: "waiting",
    participants: ["first", "second"].map((slot) => ({ displayName: "동명이인", slot: slot as "first" | "second", ready: false })),
    viewer: { role: "host", slot: null, capabilities: { canRematch: false } },
    game: { board: Array.from({ length: 225 }, () => null), nextTurn: "first", status: { status: "playing" }, moveCount: 0, lastMove: null },
    outcome: null,
  };
}
function profiles(color: string, legacy = false): { players: OmokPlayerProfile[]; startedAtMs: null } {
  return { startedAtMs: null, players: [{
    studentId: "student-a", name: "동명이인", number: 1, slot: "first",
    pet: { color, growthStage: 3, equippedFloor: "grass", ...(legacy ? {} : {
      equippedItemKeys: ["hat", "vehicle", "drink", "floor"], hiddenItemKeys: ["hat"],
    }) }, record: { wins: 0, losses: 0, draws: 0 },
  }] };
}
const pets = () => screen.getAllByRole("img").map((image) => JSON.parse(image.dataset.pet!));

describe("Omok player pet integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.current.mockResolvedValue(snapshot("one"));
    mocks.profiles.mockResolvedValue(profiles("pink"));
  });
  afterEach(cleanup);

  it("passes full equipment and hidden keys to the 56px common renderer", async () => {
    render(<OmokBoard boardId="board" boardTitle="오목" viewer="teacher" />);
    await waitFor(() => expect(pets()[0]?.color).toBe("pink"));
    expect(pets()[0]).toEqual({ color: "pink", growthStage: 3, equippedItemKeys: ["hat", "vehicle", "drink", "floor"], hiddenItemKeys: ["hat"] });
    expect(screen.getAllByRole("img")[0].dataset.size).toBe("56");
    expect(pets()[1]).toBeNull();
  });

  it("accepts legacy profiles without equipment arrays", async () => {
    mocks.profiles.mockResolvedValue(profiles("blue", true));
    render(<OmokBoard boardId="board" boardTitle="오목" viewer="teacher" />);
    await waitFor(() => expect(pets()[0]?.color).toBe("blue"));
    expect(pets()[0]).toMatchObject({ equippedItemKeys: [], hiddenItemKeys: [] });
  });

  it("ignores a previous session's delayed profile response", async () => {
    let resolveOld!: (value: ReturnType<typeof profiles>) => void;
    mocks.profiles.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    render(<OmokBoard boardId="board" boardTitle="오목" viewer="teacher" />);
    await waitFor(() => expect(mocks.profiles).toHaveBeenCalledWith("one"));
    mocks.current.mockResolvedValue(snapshot("two"));
    mocks.profiles.mockResolvedValue(profiles("blue"));
    fireEvent.click(screen.getByRole("button", { name: "최신 상태 확인" }));
    await waitFor(() => expect(pets()[0]?.color).toBe("blue"));
    await act(async () => resolveOld(profiles("pink")));
    expect(pets()[0].color).toBe("blue");
  });
});
