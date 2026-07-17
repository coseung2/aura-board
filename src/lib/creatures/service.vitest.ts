import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import {
  CREATURE_CATALOG_REVISION,
  CREATURE_RULES_VERSION,
  getCreatureStageProgressThreshold,
} from "./catalog";
import {
  CreatureServiceError,
  buildCreatureCatalogSnapshot,
  canUseHatchAccelerator,
  computeEggDraw,
  errorStatus,
  resolveCreatureDto,
  resolveProgressTransition,
  resolveInventoryDto,
  retrySerializable,
  sourceReference,
} from "./service";

describe("creature service pure contracts", () => {
  it("resolves cumulative stage transitions and crossing timestamps", () => {
    const now = new Date("2026-07-17T00:00:00.000Z");
    const transition = resolveProgressTransition({
      stage: "egg",
      progressPoints: 2,
      progressDelta: 6,
      now,
    });
    expect(transition.stageBefore).toBe("egg");
    expect(transition.stageAfter).toBe("juvenile");
    expect(transition.progressAfter).toBe(8);
    expect(transition.hatchedAt).toBe(now);
    expect(transition.juvenileAt).toBe(now);
    expect(transition.isActive).toBe(true);

    const evolved = resolveProgressTransition({
      stage: "juvenile",
      progressPoints: 14,
      progressDelta: 1,
      now,
    });
    expect(evolved.stageAfter).toBe("evolved");
    expect(evolved.evolvedAt).toBe(now);
    expect(evolved.completedAt).toBe(now);
    expect(evolved.isActive).toBe(false);
  });

  it("keeps hatch accelerators egg-only and validates product selection", () => {
    expect(canUseHatchAccelerator("egg")).toBe(true);
    expect(canUseHatchAccelerator("hatchling")).toBe(false);
    expect(() => computeEggDraw("food-dew-01", [], () => 0)).toThrowError(
      expect.objectContaining({ code: "item_not_applicable", status: 409 }),
    );
    expect(() => computeEggDraw("missing", [], () => 0)).toThrowError(
      expect.objectContaining({ code: "unknown_product", status: 400 }),
    );
  });

  it("stores deterministic random odds and does not redraw across retries", async () => {
    let randomCalls = 0;
    const draw = computeEggDraw("egg-random-01", ["terramote"], (total) => {
      randomCalls += 1;
      expect(total).toBeGreaterThan(0);
      return 0;
    });
    let attempts = 0;
    const result = await retrySerializable(async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Prisma.PrismaClientKnownRequestError("serialization", {
          code: "P2034",
          clientVersion: "test",
        });
        throw error;
      }
      return draw;
    });
    expect(attempts).toBe(2);
    expect(randomCalls).toBe(1);
    expect(result.lineKey).not.toBe("terramote");
    expect(result.catalogRevision).toBe(CREATURE_CATALOG_REVISION);
    expect(result.rulesVersion).toBe(CREATURE_RULES_VERSION);
  });

  it("draws affinity eggs from their weighted runtime pool and snapshots the odds", () => {
    let randomCalls = 0;
    const draw = computeEggDraw("egg-earth-01", [], (total) => {
      randomCalls += 1;
      expect(total).toBe(1);
      return 0;
    });
    expect(randomCalls).toBe(1);
    expect(draw.purchaseMode).toBe("affinity");
    expect(draw.lineKey).toBe("terramote");
    expect(draw.oddsSnapshot).toEqual([
      { lineKey: "terramote", weight: 1, probability: 1 },
    ]);
    expect(draw.catalogRevision).toBe(CREATURE_CATALOG_REVISION);
  });

  it("namespaces idempotency source references and maps stable errors", () => {
    expect(sourceReference("student-1", "key-1")).toBe("student-1:key-1");
    expect(() => sourceReference("student-1", "")).toThrowError(CreatureServiceError);
    expect(sourceReference("student-2", "key-1")).not.toBe(sourceReference("student-1", "key-1"));
    expect(errorStatus("insufficient_funds")).toBe(402);
    expect(errorStatus("item_unavailable")).toBe(409);
  });

  it("resolves current stage asset DTO fields without exposing internals", () => {
    const date = new Date("2026-07-17T00:00:00.000Z");
    const dto = resolveCreatureDto({
      id: "creature-1",
      lineKey: "dawnlet",
      stage: "juvenile",
      isActive: true,
      isFeatured: false,
      progressPoints: 9,
      rulesVersion: CREATURE_RULES_VERSION,
      catalogRevision: CREATURE_CATALOG_REVISION,
      purchaseMode: "random",
      oddsSnapshot: [{ lineKey: "dawnlet", weight: 1, probability: 1 }],
      incubatingStartedAt: date,
      hatchedAt: date,
      juvenileAt: date,
      evolvedAt: null,
      completedAt: null,
      createdAt: date,
      updatedAt: date,
    });
    expect(dto).toMatchObject({
      nameKo: "던릿",
      affinity: "light",
      stage: "juvenile",
      packageId: "character.aura.dawnlet.juvenile",
      assetPackageId: "character.aura.dawnlet.juvenile",
      behaviorSheetId: "behavior.aura.dawnlet.juvenile.v1",
      behaviorSheetPath: "/creatures/dawnlet/juvenile/sheet.json",
      nextThreshold: getCreatureStageProgressThreshold("evolved"),
    });
    expect(dto).not.toHaveProperty("studentId");
    expect(dto.createdAt).toBe(date.toISOString());
  });

  it("publishes grouped products and weighted random odds", () => {
    const catalog = buildCreatureCatalogSnapshot();
    expect(catalog.revision).toBe(CREATURE_CATALOG_REVISION);
    expect(catalog.rulesVersion).toBe(CREATURE_RULES_VERSION);
    expect(catalog.lines).toHaveLength(7);
    expect(catalog.productsByKind.food).toHaveLength(3);
    expect(catalog.productsByKind["hatch-accelerator"]).toHaveLength(2);
    expect(catalog.odds.map((row) => row.weight)).toEqual([24, 20, 17, 13, 10, 8, 8]);
    expect(catalog.odds.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1);
  });

  it("serializes an owned inventory item with catalog metadata", () => {
    const date = new Date("2026-07-17T00:00:00.000Z");
    expect(resolveInventoryDto({
      id: "inventory-1",
      itemKey: "food-dew-01",
      itemKind: "food",
      quantity: 2,
      isEquipped: false,
      createdAt: date,
      updatedAt: date,
    })).toMatchObject({
      itemKey: "food-dew-01",
      itemKind: "food",
      quantity: 2,
      product: { key: "food-dew-01", kind: "food" },
    });
  });
});
