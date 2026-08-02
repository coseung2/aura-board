import { readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  GAME_OUTCOMES,
  GAME_PLATFORM_SCHEMA_VERSION,
  GAME_RECORD_RANGES,
  OFFICIAL_GAME_KINDS,
} from "./contracts";
import {
  deriveBoardCategory,
  GAME_HUB_ORDER,
  isOfficialPlayLayout,
  OFFICIAL_GAME_CATALOG,
} from "./catalog";
import {
  GAME_PLATFORM_SCHEMA_VERSION as MOBILE_SCHEMA_VERSION,
  MOBILE_GAME_CATALOG,
  MOBILE_GAME_HUB_ORDER,
  MOBILE_GAME_OUTCOMES,
  MOBILE_GAME_RECORD_RANGES,
  MOBILE_OFFICIAL_GAME_KINDS,
} from "../../../apps/mobile/lib/game-platform-contract";

type ContractSchema = {
  schemaVersion: number;
  $defs: { gameKind: { enum: string[] } };
  examples: Array<{
    schemaVersion: number;
    gameKinds: Array<{ wireValue: string; displayName: string; metrics: { keys: string[] } }>;
    outcomes: string[];
    ranges: string[];
  }>;
};

const schema = JSON.parse(
  readFileSync(
    join(process.cwd(), "contracts", "game-platform-v1.schema.json"),
    "utf8",
  ),
) as ContractSchema;
const example = schema.examples[0];

describe("game platform canonical contract", () => {
  it("keeps JSON, web, and Expo mirrors at the same schema version", () => {
    expect(schema.schemaVersion).toBe(GAME_PLATFORM_SCHEMA_VERSION);
    expect(MOBILE_SCHEMA_VERSION).toBe(GAME_PLATFORM_SCHEMA_VERSION);
    expect(example.schemaVersion).toBe(GAME_PLATFORM_SCHEMA_VERSION);
  });

  it("keeps the official five kinds and display names in exact parity", () => {
    expect(schema.$defs.gameKind.enum).toEqual([...OFFICIAL_GAME_KINDS]);
    expect(MOBILE_OFFICIAL_GAME_KINDS).toEqual(OFFICIAL_GAME_KINDS);
    expect(example.gameKinds.map((entry) => entry.wireValue)).toEqual([
      ...OFFICIAL_GAME_KINDS,
    ]);
    for (const kind of OFFICIAL_GAME_KINDS) {
      expect(MOBILE_GAME_CATALOG[kind].wireValue).toBe(kind);
      expect(MOBILE_GAME_CATALOG[kind].displayName).toBe(
        OFFICIAL_GAME_CATALOG[kind].label,
      );
      expect(
        example.gameKinds.find((entry) => entry.wireValue === kind)?.displayName,
      ).toBe(OFFICIAL_GAME_CATALOG[kind].label);
    }
  });

  it("keeps game-hub order, descriptions, artwork, availability, and routes in parity", () => {
    expect(MOBILE_GAME_HUB_ORDER).toEqual(GAME_HUB_ORDER);
    expect(new Set(GAME_HUB_ORDER)).toEqual(new Set(OFFICIAL_GAME_KINDS));
    expect(new Set(GAME_HUB_ORDER.map((kind) => OFFICIAL_GAME_CATALOG[kind].artworkKey)).size)
      .toBe(OFFICIAL_GAME_KINDS.length);
    for (const kind of OFFICIAL_GAME_KINDS) {
      const web = OFFICIAL_GAME_CATALOG[kind];
      const mobile = MOBILE_GAME_CATALOG[kind];
      expect(web.description.length).toBeGreaterThan(10);
      expect(mobile.description).toBe(web.description);
      expect(mobile.artworkKey).toBe(web.artworkKey);
      expect(mobile.availability).toBe("always-open");
      expect(mobile.statusLabel).toBe(web.statusLabel);
      expect(mobile.routeSegment).toBe(web.routeSegment);
    }
  });

  it("maps every catalog entry to a real generated PNG asset", () => {
    for (const kind of GAME_HUB_ORDER) {
      const assetPath = join(
        process.cwd(),
        ".ai-bridge",
        "generated-game-hub-assets",
        `${OFFICIAL_GAME_CATALOG[kind].artworkKey}.png`,
      );
      const bytes = readFileSync(assetPath);
      expect([...bytes.subarray(0, 8)]).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      expect(statSync(assetPath).size).toBeGreaterThan(100_000);
    }
  });

  it("keeps outcomes and record ranges in exact parity", () => {
    expect(example.outcomes).toEqual([...GAME_OUTCOMES]);
    expect(MOBILE_GAME_OUTCOMES).toEqual(GAME_OUTCOMES);
    expect(example.ranges).toEqual([...GAME_RECORD_RANGES]);
    expect(MOBILE_GAME_RECORD_RANGES).toEqual(GAME_RECORD_RANGES);
  });

  it("derives PLAY only for the official five layouts", () => {
    for (const kind of OFFICIAL_GAME_KINDS) {
      expect(isOfficialPlayLayout(kind)).toBe(true);
      expect(deriveBoardCategory(kind)).toBe("PLAY");
    }
    for (const layout of ["quiz", "breakout", "vibe-arcade", "freeform", null]) {
      expect(isOfficialPlayLayout(layout)).toBe(false);
      expect(deriveBoardCategory(layout)).toBe("LESSON");
    }
  });
});
