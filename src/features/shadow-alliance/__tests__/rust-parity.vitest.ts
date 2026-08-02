import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { computeShadowAllianceRound } from "../engine";
import type { ShadowAlliancePlayer, ShadowAllianceTeam } from "../types";

type ParityFixture = {
  version: number;
  cases: Array<{
    name: string;
    command: number;
    players: Array<{
      id: string;
      team: ShadowAllianceTeam;
      number: number | null;
    }>;
    expected: {
      winner: ShadowAllianceTeam | "tie";
      blackAverage: number | null;
      whiteAverage: number | null;
      blackDifference: number | null;
      whiteDifference: number | null;
      gains: Record<string, number>;
    };
  }>;
};

const fixture = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "services/play-engine/contracts/shadow-alliance-parity-v1.json",
    ),
    "utf8",
  ),
) as ParityFixture;

describe("Shadow Alliance Rust parity fixture", () => {
  it("uses the supported fixture contract", () => {
    expect(fixture.version).toBe(1);
  });

  for (const testCase of fixture.cases) {
    it(testCase.name, () => {
      const players: ShadowAlliancePlayer[] = testCase.players.map((player) => ({
        ...player,
        nick: player.id,
        power: 0,
        lastGain: 0,
      }));
      const result = computeShadowAllianceRound(players, testCase.command);

      expect({
        winner: result.winner,
        blackAverage: result.blackAvg,
        whiteAverage: result.whiteAvg,
        blackDifference: result.blackDiff,
        whiteDifference: result.whiteDiff,
        gains: result.gains,
      }).toEqual(testCase.expected);
    });
  }
});
