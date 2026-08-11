export * from "./catalog-data";

import {
  CREATURE_AFFINITIES,
  CREATURE_BEHAVIOR_KINDS,
  CREATURE_LINES,
  CREATURE_RANDOM_EGG_WEIGHTS,
  CREATURE_SHOP_PRODUCTS,
  CREATURE_SHOP_PRODUCT_KINDS,
  CREATURE_STAGE_PROGRESS_THRESHOLDS,
  CREATURE_STAGES,
  type CreatureAffinity,
  type CreatureBehaviorKind,
  type CreatureBehaviorSequence,
  type CreatureCatalogValidationIssue,
  type CreatureLineDefinition,
  type CreatureShopProduct,
  type CreatureShopProductKind,
  type CreatureStage,
  type CreatureStageDefinition,
  type CreatureWeightedLine,
} from "./catalog-data";

const LINE_BY_KEY = new Map<string, CreatureLineDefinition>(
  CREATURE_LINES.map((line) => [line.key, line]),
);
const PRODUCT_BY_KEY = new Map<string, CreatureShopProduct>(
  CREATURE_SHOP_PRODUCTS.map((product) => [product.key, product]),
);

export function getCreatureLine(lineKey: string): CreatureLineDefinition | undefined {
  return LINE_BY_KEY.get(lineKey);
}

export function getCreatureShopProduct(productKey: string): CreatureShopProduct | undefined {
  return PRODUCT_BY_KEY.get(productKey);
}

export function getCreatureStageDefinition(
  lineKey: string,
  stage: CreatureStage,
): CreatureStageDefinition | undefined {
  return getCreatureLine(lineKey)?.stages.find((entry) => entry.stage === stage);
}

export function listCreatureShopProducts(
  kind?: CreatureShopProductKind,
): readonly CreatureShopProduct[] {
  if (kind === undefined) return CREATURE_SHOP_PRODUCTS;
  return CREATURE_SHOP_PRODUCTS.filter((product) => product.kind === kind);
}

/** Build the weighted pool for an affinity egg from every matching line. */
export function buildAffinityEggPool(
  affinity: CreatureAffinity,
  lines: readonly CreatureLineDefinition[] = CREATURE_LINES,
): readonly CreatureWeightedLine[] {
  return lines
    .filter((line) => line.affinity === affinity)
    .map((line) => ({ lineKey: line.key, weight: line.affinityEggWeight }));
}

/**
 * Return unowned lines first. Once every known line is owned, return the full
 * pool so a random egg can still be purchased. Set semantics prevent duplicate
 * owned keys from changing the result.
 */
export function buildEffectiveRandomEggPool(
  ownedLineKeys: readonly string[] = [],
): readonly CreatureWeightedLine[] {
  const owned = new Set<string>();
  if (Array.isArray(ownedLineKeys)) {
    for (const key of ownedLineKeys) if (typeof key === "string") owned.add(key);
  }
  const unowned = CREATURE_RANDOM_EGG_WEIGHTS.filter((entry) => !owned.has(entry.lineKey));
  const source = unowned.length > 0 ? unowned : CREATURE_RANDOM_EGG_WEIGHTS;
  return source.map((entry) => ({ lineKey: entry.lineKey, weight: entry.weight }));
}

/** Choose a line definition from a zero-based integer roll. */
export function chooseWeightedCreatureLine(
  pool: readonly CreatureWeightedLine[],
  roll: number,
): CreatureLineDefinition {
  if (!Array.isArray(pool) || pool.length === 0) {
    throw new RangeError("Creature random egg pool must not be empty");
  }
  if (!Number.isSafeInteger(roll) || roll < 0) {
    throw new RangeError("Creature random egg roll must be a non-negative integer");
  }

  let totalWeight = 0;
  for (const entry of pool) {
    if (
      !entry ||
      typeof entry.lineKey !== "string" ||
      !Number.isSafeInteger(entry.weight) ||
      entry.weight <= 0
    ) {
      throw new RangeError("Creature random egg weights must be positive integers");
    }
    totalWeight += entry.weight;
    if (!Number.isSafeInteger(totalWeight)) {
      throw new RangeError("Creature random egg total weight is out of bounds");
    }
  }
  if (roll >= totalWeight) {
    throw new RangeError(`Creature random egg roll must be less than ${totalWeight}`);
  }

  let cursor = roll;
  for (const entry of pool) {
    if (cursor < entry.weight) {
      const line = getCreatureLine(entry.lineKey);
      if (!line) throw new RangeError(`Unknown creature line: ${entry.lineKey}`);
      return line;
    }
    cursor -= entry.weight;
  }
  // The bounds check above makes this unreachable, but fail closed if data is
  // changed without updating the validation helper.
  throw new RangeError("Creature random egg roll did not select a line");
}

/** Key-only variant for persistence and database payloads. */
export function chooseWeightedCreatureLineKey(
  pool: readonly CreatureWeightedLine[],
  roll: number,
): string {
  return chooseWeightedCreatureLine(pool, roll).key;
}

export function getCreatureStageProgressThreshold(stage: CreatureStage): number {
  return CREATURE_STAGE_PROGRESS_THRESHOLDS[stage];
}

/** Resolve the highest stage reached by cumulative progress. */
export function getCreatureStageForProgress(progress: number): CreatureStage {
  if (!Number.isSafeInteger(progress) || progress < 0) {
    throw new RangeError("Creature progress must be a non-negative integer");
  }
  for (let index = CREATURE_STAGES.length - 1; index >= 0; index -= 1) {
    const stage = CREATURE_STAGES[index];
    if (progress >= getCreatureStageProgressThreshold(stage)) return stage;
  }
  return "egg";
}

/**
 * Return the immediate next stage. If progress is supplied, only return that
 * stage when the cumulative threshold has been reached; the evolved stage is
 * terminal and returns null.
 */
export function getNextCreatureStage(
  stage: CreatureStage,
  progress?: number,
): CreatureStage | null {
  const stageIndex = CREATURE_STAGES.indexOf(stage);
  if (stageIndex < 0 || stageIndex >= CREATURE_STAGES.length - 1) return null;
  const next = CREATURE_STAGES[stageIndex + 1];
  if (progress === undefined) return next;
  if (!Number.isSafeInteger(progress) || progress < 0) {
    throw new RangeError("Creature progress must be a non-negative integer");
  }
  return progress >= getCreatureStageProgressThreshold(next) ? next : null;
}

export type CreatureAssetBehaviorLookup = CreatureBehaviorSequence & {
  readonly lineKey: string;
  readonly affinity: CreatureAffinity;
  readonly stage: CreatureStage;
  readonly packageId: string;
  readonly behaviorSheetId: string;
  readonly behaviorSheetPath: string;
};

/** Resolve a behavior action together with the exact asset sheet references. */
export function getCreatureAssetBehaviorLookup(
  lineKey: string,
  stage: CreatureStage,
  kind: CreatureBehaviorKind,
): CreatureAssetBehaviorLookup | undefined {
  const line = getCreatureLine(lineKey);
  const stageDefinition = getCreatureStageDefinition(lineKey, stage);
  const behavior = stageDefinition?.behaviors.find((entry) => entry.kind === kind);
  if (!line || !stageDefinition || !behavior) return undefined;
  return {
    ...behavior,
    lineKey,
    affinity: line.affinity,
    stage,
    packageId: stageDefinition.packageId,
    behaviorSheetId: stageDefinition.behaviorSheetId,
    behaviorSheetPath: stageDefinition.behaviorSheetPath,
  };
}

const hasUniqueStrings = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

/**
 * Deterministically validate every catalog invariant. An empty diagnostics
 * array means the catalog is ready for use.
 */
export function validateCreatureCatalog(): readonly CreatureCatalogValidationIssue[] {
  const issues: CreatureCatalogValidationIssue[] = [];
  const issue = (path: string, message: string): void => {
    issues.push({ path, message });
  };

  if (CREATURE_LINES.length < CREATURE_AFFINITIES.length) {
    issue("lines", "There must be at least one line for every affinity");
  }
  const lineKeys = CREATURE_LINES.map((line) => line.key);
  if (!hasUniqueStrings(lineKeys)) issue("lines.key", "Line keys must be unique");
  const lineAffinities = CREATURE_LINES.map((line) => line.affinity);
  if (
    lineAffinities.some((affinity) => !CREATURE_AFFINITIES.includes(affinity)) ||
    CREATURE_AFFINITIES.some((affinity) => !lineAffinities.includes(affinity))
  ) {
    issue("lines.affinity", "Every canonical affinity must have at least one line");
  }

  for (const [lineIndex, line] of CREATURE_LINES.entries()) {
    const path = `lines[${lineIndex}]`;
    if (!Number.isSafeInteger(line.randomEggWeight) || line.randomEggWeight <= 0) {
      issue(`${path}.randomEggWeight`, "Random egg weight must be a positive integer");
    }
    if (!Number.isSafeInteger(line.affinityEggWeight) || line.affinityEggWeight <= 0) {
      issue(`${path}.affinityEggWeight`, "Affinity egg weight must be a positive integer");
    }
    if (!line.nameKo || !line.visualConcept || !line.visualConceptKo) {
      issue(path, "Line name and visual concept are required");
    }
    if (line.stages.length !== CREATURE_STAGES.length) {
      issue(`${path}.stages`, "Every line must define four stages");
    }
    const stages = line.stages.map((entry) => entry.stage);
    if (!hasUniqueStrings(stages) || CREATURE_STAGES.some((stage) => !stages.includes(stage))) {
      issue(`${path}.stages.stage`, "Every canonical stage must appear exactly once");
    }
    for (const [stageIndex, stage] of line.stages.entries()) {
      const stagePath = `${path}.stages[${stageIndex}]`;
      const expectedPackageId = `character.aura.${line.key}.${stage.stage}`;
      if (stage.packageId !== expectedPackageId) {
        issue(`${stagePath}.packageId`, `Expected package ID ${expectedPackageId}`);
      }
      if (!/^behavior\.aura\.[a-z0-9-]+\.(egg|hatchling|juvenile|evolved)\.v1$/.test(stage.behaviorSheetId)) {
        issue(`${stagePath}.behaviorSheetId`, "Behavior sheet ID has an invalid format");
      }
      if (!/^\/creatures\/[a-z0-9-]+\/(egg|hatchling|juvenile|evolved)\/sheet\.json$/.test(stage.behaviorSheetPath)) {
        issue(`${stagePath}.behaviorSheetPath`, "Behavior sheet path has an invalid format");
      }
      if (stage.behaviors.length !== CREATURE_BEHAVIOR_KINDS.length) {
        issue(`${stagePath}.behaviors`, "Every stage must define exactly three behaviors");
      }
      const kinds = stage.behaviors.map((entry) => entry.kind);
      if (!hasUniqueStrings(kinds) || CREATURE_BEHAVIOR_KINDS.some((kind) => !kinds.includes(kind))) {
        issue(`${stagePath}.behaviors.kind`, "Normal, lazy, and signature are required exactly once");
      }
      for (const [behaviorIndex, behavior] of stage.behaviors.entries()) {
        if (!behavior.actionId || !behavior.labelKo || !behavior.descriptionKo) {
          issue(`${stagePath}.behaviors[${behaviorIndex}]`, "Behavior action metadata is required");
        }
      }
    }
  }

  if (CREATURE_RANDOM_EGG_WEIGHTS.length !== CREATURE_LINES.length) {
    issue("randomEggWeights", "Random egg weights must cover every line");
  }
  const weightedKeys = CREATURE_RANDOM_EGG_WEIGHTS.map((entry) => entry.lineKey);
  if (!hasUniqueStrings(weightedKeys) || weightedKeys.some((key) => !LINE_BY_KEY.has(key))) {
    issue("randomEggWeights.lineKey", "Random egg weights must reference each line once");
  }
  for (const [index, entry] of CREATURE_RANDOM_EGG_WEIGHTS.entries()) {
    if (!Number.isSafeInteger(entry.weight) || entry.weight <= 0) {
      issue(`randomEggWeights[${index}].weight`, "Weight must be a positive integer");
    }
    if (LINE_BY_KEY.get(entry.lineKey)?.randomEggWeight !== entry.weight) {
      issue(`randomEggWeights[${index}]`, "Weight must match the line definition");
    }
  }

  const randomWeightByAffinity = new Map<CreatureAffinity, number>(
    CREATURE_AFFINITIES.map((affinity) => [affinity, 0]),
  );
  for (const entry of CREATURE_RANDOM_EGG_WEIGHTS) {
    const affinity = LINE_BY_KEY.get(entry.lineKey)?.affinity;
    if (!affinity) continue;
    randomWeightByAffinity.set(
      affinity,
      (randomWeightByAffinity.get(affinity) ?? 0) + entry.weight,
    );
  }
  const randomAffinityTotals = CREATURE_AFFINITIES.map(
    (affinity) => randomWeightByAffinity.get(affinity) ?? 0,
  );
  for (let index = 1; index <= 4; index += 1) {
    if (!(randomAffinityTotals[index - 1]! > randomAffinityTotals[index]!)) {
      issue(
        "randomEggWeights.affinityOrder",
        "Affinity totals must descend earth, river, sea, volcano, sky",
      );
      break;
    }
  }
  const skyTotal = randomWeightByAffinity.get("sky") ?? 0;
  const darknessTotal = randomWeightByAffinity.get("darkness") ?? 0;
  const lightTotal = randomWeightByAffinity.get("light") ?? 0;
  if (!(skyTotal > darknessTotal && skyTotal > lightTotal)) {
    issue(
      "randomEggWeights.affinityOrder",
      "Darkness and light totals must remain below sky (they may tie)",
    );
  }

  const productKeys = CREATURE_SHOP_PRODUCTS.map((product) => product.key);
  if (!hasUniqueStrings(productKeys)) issue("products.key", "Product keys must be unique");
  for (const [index, product] of CREATURE_SHOP_PRODUCTS.entries()) {
    const path = `products[${index}]`;
    if (!CREATURE_SHOP_PRODUCT_KINDS.includes(product.kind)) issue(`${path}.kind`, "Unknown product kind");
    if (!Number.isSafeInteger(product.price) || product.price <= 0 || product.price > 10_000) {
      issue(`${path}.price`, "Price must be a bounded positive integer");
    }
    if (!product.labelKo || !product.descriptionKo || product.visible !== true) {
      issue(path, "Product label, description, and visibility are required");
    }
    if (product.effect.type !== product.kind) issue(`${path}.effect.type`, "Effect type must match product kind");
    if (product.effect.type === "food" && (!Number.isSafeInteger(product.effect.progressPoints) || product.effect.progressPoints <= 0)) {
      issue(`${path}.effect.progressPoints`, "Food progress must be a positive integer");
    }
    if (product.effect.type === "hatch-accelerator" && (!Number.isSafeInteger(product.effect.hatchProgressPoints) || product.effect.hatchProgressPoints <= 0)) {
      issue(`${path}.effect.hatchProgressPoints`, "Hatch progress must be a positive integer");
    }
    if (product.effect.type === "affinity-egg") {
      const pool = buildAffinityEggPool(product.effect.affinity);
      if (pool.length === 0) {
        issue(`${path}.effect`, "Affinity egg pool must not be empty");
      }
      for (const [poolIndex, entry] of pool.entries()) {
        if (!Number.isSafeInteger(entry.weight) || entry.weight <= 0) {
          issue(
            `${path}.effect.pool[${poolIndex}].weight`,
            "Affinity egg weights must be positive integers",
          );
        }
      }
    }
    if (product.effect.type === "background-effect" && (!product.effect.effectKey || !Number.isSafeInteger(product.effect.intensity) || product.effect.intensity <= 0)) {
      issue(`${path}.effect`, "Background effect key and positive intensity are required");
    }
  }

  const randomProducts = CREATURE_SHOP_PRODUCTS.filter((product) => product.kind === "random-egg");
  const affinityProducts = CREATURE_SHOP_PRODUCTS.filter((product) => product.kind === "affinity-egg");
  const foodProducts = CREATURE_SHOP_PRODUCTS.filter((product) => product.kind === "food");
  const acceleratorProducts = CREATURE_SHOP_PRODUCTS.filter((product) => product.kind === "hatch-accelerator");
  const backgroundProducts = CREATURE_SHOP_PRODUCTS.filter((product) => product.kind === "background-effect");
  if (randomProducts.length !== 1) issue("products.random-egg", "There must be one random egg product");
  if (affinityProducts.length !== CREATURE_AFFINITIES.length) issue("products.affinity-egg", "There must be one egg product per affinity");
  if (foodProducts.length < 3) issue("products.food", "At least three food products are required");
  if (acceleratorProducts.length < 2) issue("products.hatch-accelerator", "At least two hatch accelerators are required");
  if (backgroundProducts.length !== CREATURE_AFFINITIES.length) issue("products.background-effect", "There must be one background effect per affinity");

  const randomPrice = randomProducts[0]?.price;
  const baseAffinities = new Set<CreatureAffinity>(["earth", "river", "sea"]);
  const premiumAffinities = new Set<CreatureAffinity>(["volcano", "sky", "darkness", "light"]);
  const affinityPrices = affinityProducts.flatMap((product) =>
    product.effect.type === "affinity-egg"
      ? [{ affinity: product.effect.affinity, price: product.price }]
      : [],
  );
  const basePrices = affinityPrices
    .filter(({ affinity }) => baseAffinities.has(affinity))
    .map(({ price }) => price);
  const premiumPrices = affinityPrices
    .filter(({ affinity }) => premiumAffinities.has(affinity))
    .map(({ price }) => price);
  if (
    randomPrice !== undefined &&
    (basePrices.length === 0 || premiumPrices.length === 0 ||
      randomPrice <= Math.max(...basePrices) ||
      randomPrice >= Math.min(...premiumPrices))
  ) {
    issue(
      "products.random-egg.price",
      "Random egg price must be above basic affinity eggs and below premium affinity eggs",
    );
  }
  const affinityByKey = new Set<string>();
  for (const product of affinityProducts) {
    if (product.effect.type !== "affinity-egg") continue;
    if (affinityByKey.has(product.effect.affinity)) issue("products.affinity-egg", "Affinity eggs must be unique");
    affinityByKey.add(product.effect.affinity);
    if (!CREATURE_AFFINITIES.includes(product.effect.affinity)) {
      issue("products.affinity-egg.effect", "Affinity egg must reference a canonical affinity");
    }
    if (!CREATURE_LINES.some((line) => line.affinity === product.effect.affinity)) {
      issue("products.affinity-egg.effect", "Affinity egg must reference an affinity with at least one line");
    }
  }
  if (CREATURE_AFFINITIES.some((affinity) => !affinityByKey.has(affinity))) {
    issue("products.affinity-egg", "Affinity eggs must cover every affinity");
  }
  const backgroundAffinities = new Set<string>();
  for (const product of backgroundProducts) {
    if (product.effect.type !== "background-effect") continue;
    if (backgroundAffinities.has(product.effect.affinity)) issue("products.background-effect", "Background affinities must be unique");
    backgroundAffinities.add(product.effect.affinity);
  }
  return issues;
}

/** A snapshot useful to tests and diagnostics; the data itself remains readonly. */
export const CREATURE_CATALOG_VALIDATION = validateCreatureCatalog();
