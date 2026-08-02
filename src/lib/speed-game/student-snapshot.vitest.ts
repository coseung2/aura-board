import { describe, expect, it } from "vitest";
import type { SpeedGameWire } from "@/components/speed-game/types";
import { sanitizeGameSnapshotForStudent } from "./student-snapshot";

function snapshot(status: SpeedGameWire["status"] = "active"): SpeedGameWire {
  return {
    id: "game-1",
    runId: "run-1",
    version: 7,
    terminalReason: status === "finished" ? "completed" : null,
    boardId: "board-1",
    boardSlug: "speed",
    classroomId: "class-1",
    status,
    roundIndex: 1,
    answerMode: "teacher-approval",
    baseScore: 100,
    minScore: 10,
    bonusRanks: [30, 20, 10],
    timeLimitMs: 30_000,
    rounds: [
      {
        id: "round-0",
        order: 0,
        keyword: "지난 제시어",
        guesserSlot: 1,
        startedAt: "2026-08-02T00:00:00.000Z",
        endedAt: "2026-08-02T00:00:30.000Z",
      },
      {
        id: "round-1",
        order: 1,
        keyword: "현재 제시어",
        guesserSlot: 2,
        startedAt: "2026-08-02T00:00:31.000Z",
        endedAt: null,
      },
    ],
    answers: [
      {
        id: "own-answer",
        roundId: "round-1",
        groupId: "group-a",
        studentId: "student-a",
        answer: "우리 답",
        correct: null,
        elapsedMs: 3_000,
        rank: null,
        score: null,
        createdAt: "2026-08-02T00:00:34.000Z",
      },
      {
        id: "other-answer",
        roundId: "round-1",
        groupId: "group-b",
        studentId: "student-b",
        answer: "다른 모둠 답",
        correct: true,
        elapsedMs: 2_000,
        rank: 1,
        score: 120,
        createdAt: "2026-08-02T00:00:33.000Z",
      },
    ],
    groups: [
      {
        id: "group-a",
        name: "A",
        studentIds: ["student-explainer", "student-a"],
      },
      { id: "group-b", name: "B", studentIds: ["student-b"] },
    ],
    participants: [
      {
        studentId: "student-a",
        groupId: "group-a",
        name: "학생 A",
        invitedAt: "2026-08-02T00:00:00.000Z",
        joinedAt: "2026-08-02T00:00:01.000Z",
        readyAt: null,
        forfeitedAt: null,
      },
    ],
    leaderboard: [
      { groupId: "group-b", groupName: "B", score: 120 },
      { groupId: "group-a", groupName: "A", score: 0 },
    ],
  };
}

describe("sanitizeGameSnapshotForStudent", () => {
  it("hides the current keyword from the guesser and other groups' answers", () => {
    const sanitized = sanitizeGameSnapshotForStudent(snapshot(), "student-a");
    expect(sanitized.rounds.map((round) => round.keyword)).toEqual([
      "지난 제시어",
      "",
    ]);
    expect(sanitized.answers.find((answer) => answer.id === "own-answer")?.answer).toBe(
      "우리 답",
    );
    expect(
      sanitized.answers.find((answer) => answer.id === "other-answer")?.answer,
    ).toBe("");
    expect(sanitized.runId).toBe("run-1");
    expect(sanitized.version).toBe(7);
  });

  it("reveals the current keyword to a non-guesser in the same group", () => {
    const sanitized = sanitizeGameSnapshotForStudent(
      snapshot(),
      "student-explainer",
    );
    expect(sanitized.rounds.map((round) => round.keyword)).toEqual([
      "지난 제시어",
      "현재 제시어",
    ]);
  });

  it("reveals completed run answers and keywords", () => {
    const sanitized = sanitizeGameSnapshotForStudent(
      snapshot("finished"),
      "student-a",
    );
    expect(sanitized.rounds[1].keyword).toBe("현재 제시어");
    expect(sanitized.answers[1].answer).toBe("다른 모둠 답");
  });
});
