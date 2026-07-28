import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  issueQuizPlayerToken,
  verifyQuizPlayerToken,
} from "./quiz-player-token";

describe("quiz player capability tokens", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T00:00:00.000Z"));
    vi.stubEnv("AUTH_SECRET", "quiz-test-secret");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("round-trips player and quiz bindings", () => {
    const issued = issueQuizPlayerToken("player-1", "quiz-1");
    expect(verifyQuizPlayerToken(issued.token)).toEqual({
      playerId: "player-1",
      quizId: "quiz-1",
      expiresAt: issued.expiresAt,
    });
  });

  it("rejects tampered and expired tokens", () => {
    const issued = issueQuizPlayerToken("player-1", "quiz-1");
    expect(verifyQuizPlayerToken(`${issued.token}x`)).toBeNull();

    vi.setSystemTime(issued.expiresAt);
    expect(verifyQuizPlayerToken(issued.token)).toBeNull();
  });

  it("does not issue tokens without AUTH_SECRET in production", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => issueQuizPlayerToken("player-1", "quiz-1")).toThrow(
      "AUTH_SECRET is required in production",
    );
  });
});
