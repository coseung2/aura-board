import { describe, expect, it } from "vitest";
import {
  computeShadowAllianceRound,
  createShadowAllianceGame,
  endShadowAllianceGame,
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
