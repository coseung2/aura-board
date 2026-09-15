import { describe, expect, it } from "vitest";
import { combineHubStatus, OPEN_HUB_STATUS, playHubStatus } from "./hub-status";

describe("truthful play hub status", () => {
  it("counts acknowledged song entrants rather than the seeded classroom roster", () => {
    expect(playHubStatus("song-guess", { rulesVersion: 2, state: { phase: "lobby", participants: [{ joined: true }, { joined: false }, {}] } }))
      .toEqual({ phase: "waiting", label: "대기 중", playerCount: 1, countKind: "participants" });
  });
  it("retains the legacy joined contract, but never presents history as active", () => {
    expect(playHubStatus("song-guess", { rulesVersion: 1, state: { phase: "guessing", participants: [{}] } }).playerCount).toBe(1);
    expect(playHubStatus("song-guess", { state: { phase: "finished", participants: [{ joined: true }] } })).toEqual(OPEN_HUB_STATUS);
  });
  it("treats reveal as a round in progress, not a waiting room", () => {
    expect(playHubStatus("song-guess", { state: { phase: "reveal", participants: [] } }).phase).toBe("active");
  });
  it("a completed timestamp wins over stale active state", () => {
    expect(playHubStatus("omok", { state: { roomStatus: "active" } }, 42n)).toEqual(OPEN_HUB_STATUS);
  });
  it("readiness is not already playing", () => {
    expect(playHubStatus("omok", { state: { roomStatus: "ready" } }).phase).toBe("waiting");
  });
  it("counts shadow membership separately from forfeiture and timers", () => {
    expect(playHubStatus("shadow-alliance", { participants: { a: { joinedAtMs: 0 }, b: { joinedAtMs: null }, c: { joinedAtMs: 1, forfeitedAtMs: 2 } }, state: { phase: "playing", timerRunning: false } }))
      .toEqual({ phase: "paused", label: "일시정지", playerCount: 1, countKind: "participants" });
  });
  it("combines multiple rooms without a finished room winning over a live one", () => {
    const active = { phase: "active" as const, label: "진행 중", playerCount: 2, countKind: "participants" as const };
    expect(combineHubStatus(active, OPEN_HUB_STATUS)).toEqual(active);
    expect(combineHubStatus(active, { phase: "waiting", label: "대기 중", playerCount: 1, countKind: "participants" }).playerCount).toBe(3);
  });
});
