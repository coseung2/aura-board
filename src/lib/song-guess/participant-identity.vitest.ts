import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sessionFindUnique: vi.fn(),
  studentFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    playSession: { findUnique: mocks.sessionFindUnique },
    student: { findMany: mocks.studentFindMany },
  },
}));

import type { SongGuessSnapshot } from "./contracts";
import { enrichSongGuessSnapshot } from "./participant-identity";

function snapshot(): SongGuessSnapshot {
  return {
    sessionId: "session-1",
    boardId: "board-1",
    gameKind: "song-guess",
    version: 4,
    serverTimeMs: 1_000,
    rulesVersion: 1,
    stateSchemaVersion: 1,
    previousSessionId: null,
    phase: "finished",
    currentRound: {
      roundId: "round-1",
      order: 0,
      accessibilityClue: null,
      revealedAnswer: "Blue Moon",
      currentClip: null,
    },
    participants: [
      { displayName: "같은 이름", score: 1_000, scoredCurrentRound: true },
      { displayName: "같은 이름", score: 700, scoredCurrentRound: false },
    ],
    viewer: { role: "host", scoredCurrentRound: false },
  };
}

describe("song-guess participant identity enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionFindUnique.mockResolvedValue({
      boardId: "board-1",
      gameKind: "song-guess",
      board: { classroomId: "classroom-1" },
      // Deliberately reversed to prove numeric player slots, not names or DB
      // return order, determine the mapping.
      participants: [
        { actorSubject: "student:student-b", studentId: null, slot: "player:1" },
        { actorSubject: "student:student-a", studentId: null, slot: "player:0" },
      ],
    });
    mocks.studentFindMany.mockResolvedValue([
      {
        id: "student-b",
        slimes: [{
          color: "green",
          growthStage: 2,
          equippedItemKeys: ["slime-ball-soccer-ball"],
          hiddenItemKeys: ["stale-item", "slime-ball-soccer-ball"],
          equippedTitleKey: null,
        }],
      },
      { id: "student-a", slimes: [] },
    ]);
  });

  it("maps every leaderboard row by its persisted player slot", async () => {
    const enriched = await enrichSongGuessSnapshot(snapshot());

    expect(enriched.participants).toEqual([
      {
        displayName: "같은 이름",
        score: 1_000,
        scoredCurrentRound: true,
        participantId: "student-a",
        representativePet: null,
      },
      {
        displayName: "같은 이름",
        score: 700,
        scoredCurrentRound: false,
        participantId: "student-b",
        representativePet: {
          color: "green",
          growthStage: 2,
          equippedItemKeys: ["slime-ball-soccer-ball"],
          hiddenItemKeys: ["slime-ball-soccer-ball"],
          equippedTitleKey: null,
        },
      },
    ]);
    expect(mocks.studentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { classroomId: "classroom-1", id: { in: ["student-a", "student-b"] } },
    }));
  });

  it("does not attach a pet when a session participant is outside its classroom", async () => {
    mocks.studentFindMany.mockResolvedValue([]);
    const original = snapshot();

    await expect(enrichSongGuessSnapshot(original)).resolves.toEqual(original);
    expect(mocks.studentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { classroomId: "classroom-1", id: { in: ["student-a", "student-b"] } },
    }));
  });

  it("leaves legacy or mismatched snapshots unchanged", async () => {
    const original = snapshot();
    mocks.sessionFindUnique.mockResolvedValue({
      boardId: "another-board",
      gameKind: "song-guess",
      board: { classroomId: "classroom-1" },
      participants: [],
    });

    await expect(enrichSongGuessSnapshot(original)).resolves.toEqual(original);
    expect(mocks.studentFindMany).not.toHaveBeenCalled();
  });

  it("refuses to guess identity when persisted player slots are malformed", async () => {
    const original = snapshot();
    mocks.sessionFindUnique.mockResolvedValue({
      boardId: "board-1",
      gameKind: "song-guess",
      board: { classroomId: "classroom-1" },
      participants: [
        { actorSubject: "student:student-a", studentId: null, slot: "player:0" },
        { actorSubject: "student:student-b", studentId: null, slot: "player:2" },
      ],
    });

    await expect(enrichSongGuessSnapshot(original)).resolves.toEqual(original);
    expect(mocks.studentFindMany).not.toHaveBeenCalled();
  });
});
