import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  run: vi.fn(), slimes: vi.fn(), game: vi.fn(), currentRun: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {
  speedGameRun: { findUnique: mocks.run, findFirst: mocks.currentRun },
  speedGame: { findUnique: mocks.game },
  studentSlime: { findMany: mocks.slimes },
} }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/student-auth", () => ({ getCurrentStudentIdentityRaw: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ getBoardRole: vi.fn() }));

import { loadGameSnapshot, loadSpeedGameRunSnapshot } from "./runtime-core";
import { sanitizeGameSnapshotForStudent } from "./student-snapshot";

const equipment = ["hat", "drink", "food", "prop", "vehicle", "background", "floor"];
const pet = (studentId: string, color: string) => ({
  studentId, color, growthStage: 3, equippedItemKeys: equipment, hiddenItemKeys: ["hat"],
});
function run(classroomId: string | null = "class-a") {
  return {
    id: "run", gameId: "game", boardId: "board", version: 1n,
    game: { board: { slug: "speed", classroomId } },
    status: "waiting", terminalReason: null, currentRoundIndex: -1,
    configSnapshot: { answerMode: "exact", baseScore: 100, minScore: 0, bonusRanks: [] },
    rounds: [], groups: [{ id: "group", name: "모둠" }],
    participants: ["a", "b", "moved", "no-pet"].map((studentId, memberOrder) => ({
      studentId, groupId: "group", memberOrder, student: { name: "동명이인" },
      invitedAt: new Date(0), joinedAt: null, readyAt: null, forfeitedAt: null,
    })),
  };
}

describe("Speed representative pets in the canonical snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.run.mockResolvedValue(run());
    mocks.game.mockResolvedValue({ id: "game" });
    mocks.currentRun.mockResolvedValue({ id: "run" });
    mocks.slimes.mockResolvedValue([pet("b", "blue"), pet("a", "pink")]);
  });

  it("attributes unordered results by student ID, scopes current student and pet classroom, and preserves all keys", async () => {
    const snapshot = await loadSpeedGameRunSnapshot("run");
    expect(mocks.slimes).toHaveBeenCalledWith({
      where: {
        classroomId: "class-a", student: { classroomId: "class-a" },
        studentId: { in: ["a", "b", "moved", "no-pet"] }, isRepresentative: true,
      },
      select: { studentId: true, color: true, growthStage: true, equippedItemKeys: true, hiddenItemKeys: true },
    });
    expect(snapshot?.participants.map((p) => [p.studentId, p.representativePet?.color ?? null]))
      .toEqual([["a", "pink"], ["b", "blue"], ["moved", null], ["no-pet", null]]);
    expect(snapshot?.participants[0].representativePet).toEqual({
      color: "pink", growthStage: 3, equippedItemKeys: equipment, hiddenItemKeys: ["hat"],
    });
    expect(snapshot?.leaderboard).toEqual([{ groupId: "group", groupName: "모둠", score: 0 }]);
  });

  it("keeps initial/HTTP, transaction command and student projections equivalent", async () => {
    const initial = await loadGameSnapshot("game");
    const txSlimes = vi.fn().mockResolvedValue([pet("b", "blue"), pet("a", "pink")]);
    const tx = { speedGameRun: { findUnique: mocks.run }, studentSlime: { findMany: txSlimes } };
    const command = await loadSpeedGameRunSnapshot("run", tx as never);
    expect(command).toEqual(initial);
    expect(txSlimes).toHaveBeenCalledOnce();
    expect(sanitizeGameSnapshotForStudent(initial!, "a").participants).toEqual(command?.participants);
  });

  it("reloads the current representative even when the game version is unchanged", async () => {
    const before = await loadSpeedGameRunSnapshot("run");
    mocks.slimes.mockResolvedValue([pet("a", "green")]);
    const after = await loadSpeedGameRunSnapshot("run");
    expect(after?.version).toBe(before?.version);
    expect(after?.participants[0].representativePet?.color).toBe("green");
    expect(after?.participants[1].representativePet).toBeNull();
  });

  it("does not query pets without a classroom or participants", async () => {
    mocks.run.mockResolvedValue(run(null));
    expect((await loadSpeedGameRunSnapshot("run"))?.participants.every((p) => p.representativePet === null)).toBe(true);
    mocks.run.mockResolvedValue({ ...run(), participants: [] });
    await loadSpeedGameRunSnapshot("run");
    expect(mocks.slimes).not.toHaveBeenCalled();
  });
});
