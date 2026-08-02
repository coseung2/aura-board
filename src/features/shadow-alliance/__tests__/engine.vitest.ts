import { describe, expect, it } from "vitest";
import parityFixture from "../../../../services/play-engine/contracts/shadow-alliance-parity-v1.json";
import {
  computeShadowAllianceRound,
  createShadowAllianceGame,
  endShadowAllianceGame,
  moveShadowAllianceToPostround,
  nextShadowAllianceRound,
  revealShadowAllianceRound,
  resetShadowAllianceGame,
  startShadowAllianceGame,
  submitShadowAllianceNumber,
  toShadowAllianceSnapshot,
} from "../engine";
import type { ShadowAllianceGame, ShadowAlliancePlayer } from "../types";

function player(
  id: string,
  team: "black" | "white",
  number: number | null,
): ShadowAlliancePlayer {
  return { id, nick: id, team, number, power: 0, lastGain: 0 };
}

describe("Shadow Alliance engine", () => {
  it.each(parityFixture.cases)("matches shared parity fixture: $name", (testCase) => {
    const result = computeShadowAllianceRound(
      testCase.players.map((candidate) =>
        player(
          candidate.id,
          candidate.team as "black" | "white",
          candidate.number,
        ),
      ),
      testCase.command,
    );

    expect({
      winner: result.winner,
      blackAverage: result.blackAvg,
      whiteAverage: result.whiteAvg,
      blackDifference: result.blackDiff,
      whiteDifference: result.whiteDiff,
      gains: result.gains,
    }).toEqual(testCase.expected);
  });

  it("awards 10,000 points proportionally to the closer team", () => {
    const result = computeShadowAllianceRound(
      [player("black-1", "black", 44), player("black-2", "black", 46), player("white-1", "white", 70)],
      45,
    );

    expect(result.winner).toBe("black");
    expect(result.gains["black-1"]).toBe(4_889);
    expect(result.gains["black-2"]).toBe(5_111);
    expect(result.gains["white-1"]).toBe(0);
  });

  it("makes a team with no submitted answers lose to the submitted team", () => {
    const result = computeShadowAllianceRound(
      [player("black", "black", null), player("white", "white", 50)],
      50,
    );

    expect(result.winner).toBe("white");
    expect(result.gains.white).toBe(10_000);
  });

  it("treats mathematically equal rational distances as a tie", () => {
    const result = computeShadowAllianceRound(
      [
        player("black-1", "black", 27),
        player("black-2", "black", 28),
        player("black-3", "black", 28),
        player("white-1", "white", 32),
        player("white-2", "white", 32),
        player("white-3", "white", 33),
      ],
      30,
    );

    expect(result.winner).toBe("tie");
    expect(result.blackDiff).toBe(2.3);
    expect(result.whiteDiff).toBe(2.3);
    expect(Object.values(result.gains).every((gain) => gain === 0)).toBe(true);
  });

  it("conserves the reward pool and breaks equal remainders by player id", () => {
    const result = computeShadowAllianceRound(
      [
        player("zulu", "black", 1),
        player("alpha", "black", 1),
        player("mike", "black", 1),
        player("white", "white", null),
      ],
      30,
    );

    expect(result.winner).toBe("black");
    expect(result.gains).toEqual({
      zulu: 3_333,
      alpha: 3_334,
      mike: 3_333,
      white: 0,
    });
    expect(Object.values(result.gains).reduce((sum, gain) => sum + gain, 0)).toBe(
      10_000,
    );
  });

  it("clamps submissions and hides numbers in the public snapshot", () => {
    const base: ShadowAllianceGame = {
      ...createShadowAllianceGame(),
      phase: "playing",
      command: 50,
      players: [player("agent", "black", null)],
    };
    const submitted = submitShadowAllianceNumber(base, "agent", 101);

    expect(submitted.players[0].number).toBe(100);
    expect(toShadowAllianceSnapshot(submitted).players[0]).toMatchObject({
      id: "agent",
      submitted: true,
    });
    expect(toShadowAllianceSnapshot(submitted).players[0]).not.toHaveProperty("number");
  });

  it("requires two players to start and transitions to reveal explicitly", () => {
    const empty = startShadowAllianceGame(createShadowAllianceGame());
    expect(empty.phase).toBe("lobby");

    const active = startShadowAllianceGame({
      ...createShadowAllianceGame(),
      players: [player("black", "black", null), player("white", "white", null)],
    });
    const revealed = revealShadowAllianceRound(active);
    expect(active.phase).toBe("playing");
    expect(revealed.phase).toBe("revealing");
  });

  it("exposes the lifecycle phases through snapshots", () => {
    let game = startShadowAllianceGame({
      ...createShadowAllianceGame(),
      players: [player("black", "black", null), player("white", "white", null)],
    });
    expect(toShadowAllianceSnapshot(game).phase).toBe("playing");

    game = revealShadowAllianceRound(game);
    expect(toShadowAllianceSnapshot(game).phase).toBe("revealing");

    game = moveShadowAllianceToPostround(game);
    expect(toShadowAllianceSnapshot(game).phase).toBe("postround");

    game = nextShadowAllianceRound(game);
    expect(toShadowAllianceSnapshot(game).phase).toBe("playing");

    game = endShadowAllianceGame(game);
    expect(toShadowAllianceSnapshot(game).phase).toBe("final");
  });

  it("ends an active game and can reset it to the waiting state", () => {
    const active = startShadowAllianceGame({
      ...createShadowAllianceGame(),
      players: [player("black", "black", null), player("white", "white", null)],
    });
    const ended = endShadowAllianceGame({ ...active, timerRunning: true });

    expect(ended.phase).toBe("final");
    expect(ended.timerRunning).toBe(false);
    expect(resetShadowAllianceGame().phase).toBe("lobby");
  });
});
