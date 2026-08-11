#!/usr/bin/env node

/**
 * Import the anchor-based slime composition package into the web and Expo
 * asset roots.
 *
 * The source package stores one overlay sheet per (role, option, timeline,
 * color) plus a per-frame `transforms` track of
 * `{ source_idle_frame, dx, dy }`. Two measured properties let this importer
 * store far less than the source does:
 *
 * 1. Wearable roles (`headwear`, `eyewear`, `blush`) have an `idle` sheet whose
 *    pixels and anchors are identical across all five slime colors, and every
 *    `drink-<flavor>` sheet is exactly that idle sheet replayed through its own
 *    anchor track. So one idle sheet plus anchor tracks reproduces every drink
 *    timeline; the drink sheets are never stored.
 * 2. The `drink` role has no idle timeline and uses identity anchors, but its
 *    pixels are color-sensitive (blue ramune drops highlight pixels on a blue
 *    slime), so its per-color sheets are preserved.
 *
 * Nothing is assumed. Property 1 is re-derived and byte-verified for every
 * frame at import time, and the import fails loudly when a source package stops
 * satisfying it. Anchor tracks stay per color because character silhouettes are
 * not perfectly aligned across colors.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  publishStagedImportOutputs,
  writeChunkedRegistry,
} from "../src/lib/pets/chunked-registry-writer.mjs";
import {
  mobileRegistryPublicationItems,
  stageMobileGeneratedRegistry,
} from "../apps/mobile/scripts/split-generated-slime-registries.mjs";
import {
  CANVAS,
  FRAME_COUNT,
  IDLE_DERIVED_ROLES,
  SLIME_COLORS,
  UNPUBLISHED_ROLES,
  WEARABLE_ROLES,
  timelineSpec,
} from "../src/lib/pets/slime-wearable-import-contract.mjs";
import {
  buildEntry,
  entryLiteral,
  exists,
  generateNearestFourX,
  listDirectories,
  readJson,
  readTimelineCell,
  renderMobileRegistry,
  sheetMetadata,
  timelineKey,
  timelinePayload,
  toPosix,
  validateEntry,
  verifyIdleDerivation,
  webSheetsField,
  writeJson,
} from "./slime-wearable-import-helpers.mjs";

export { SLIME_COLORS, IDLE_DERIVED_ROLES, UNPUBLISHED_ROLES, WEARABLE_ROLES };

export const publishSlimeWearablesImportOutputs = publishStagedImportOutputs;

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const canonicalWebRoot = path.join(
  projectRoot,
  "public",
  "creatures",
  "slimes",
  "official",
  "composition",
);
const canonicalMobileRoot = path.join(
  projectRoot,
  "apps",
  "mobile",
  "assets",
  "slimes",
  "composition",
);
const canonicalWebRegistryPath = path.join(
  projectRoot,
  "src",
  "lib",
  "pets",
  "slime-wearables.generated.ts",
);
const canonicalMobileRegistryPath = path.join(
  projectRoot,
  "apps",
  "mobile",
  "lib",
  "slime-wearables.generated.ts",
);
let webRoot = canonicalWebRoot;
let mobileRoot = canonicalMobileRoot;
let webRegistryPath = canonicalWebRegistryPath;
let mobileRegistryPath = canonicalMobileRegistryPath;

function assertProjectOutput(outputRoot) {
  const relative = path.relative(projectRoot, outputRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Refusing to write slime wearables outside the project: ${outputRoot}`,
    );
  }
}

async function main(argv = process.argv.slice(2)) {
  const positional = [];
  let extraOverlaysArgument = null;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") {
      console.error(
        "Usage: node scripts/import-slime-wearables.mjs <SlimeAssets/props/composition> " +
          "[--extra-overlays <overlays-root>]",
      );
      return;
    }
    if (value === "--extra-overlays") {
      extraOverlaysArgument = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    positional.push(value);
  }
  const sourceArgument = positional[0];
  if (
    !sourceArgument ||
    positional.length !== 1 ||
    (extraOverlaysArgument === null && argv.includes("--extra-overlays"))
  ) {
    console.error(
      "Usage: node scripts/import-slime-wearables.mjs <SlimeAssets/props/composition> " +
        "[--extra-overlays <overlays-root>]",
    );
    process.exitCode = 2;
    return;
  }

  const sourceRoot = path.resolve(sourceArgument);
  const sourceStat = await fs.stat(sourceRoot).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    throw new Error(
      `Composition source directory does not exist: ${sourceRoot}`,
    );
  }
  const sourceRealRoot = await fs.realpath(sourceRoot);
  const projectRealRoot = await fs.realpath(projectRoot);
  if (
    sourceRealRoot === projectRealRoot ||
    sourceRealRoot.startsWith(`${projectRealRoot}${path.sep}`)
  ) {
    throw new Error(
      "Composition source must be external to the project runtime roots",
    );
  }

  const contract = await readJson(path.join(sourceRoot, "contract.json"));
  if (
    contract.canvas?.width !== CANVAS.width ||
    contract.canvas?.height !== CANVAS.height
  ) {
    throw new Error(
      "Composition contract canvas does not match the expected 64x64 viewport",
    );
  }
  if (contract.frames !== FRAME_COUNT) {
    throw new Error(
      `Composition contract declares ${contract.frames} frames, expected ${FRAME_COUNT}`,
    );
  }
  const contractOrder = contract.layers_bottom_to_top ?? [];
  const expectedOrder = ["slime", ...WEARABLE_ROLES];
  if (JSON.stringify(contractOrder) !== JSON.stringify(expectedOrder)) {
    throw new Error(
      `Composition contract layer order changed: ${contractOrder.join(" -> ")}. ` +
        `This importer expects ${expectedOrder.join(" -> ")}.`,
    );
  }

  const overlaysRoot = path.join(sourceRoot, "overlays");
  /**
   * Optional additional overlay roots, used while a wearable family lives in a
   * vendored bridge package instead of the external asset package. They share
   * the external layout, so discovery and validation are identical.
   */
  const extraOverlayRoots = [];
  if (extraOverlaysArgument) {
    const extraRoot = path.resolve(extraOverlaysArgument);
    const extraStat = await fs.stat(extraRoot).catch(() => null);
    if (!extraStat?.isDirectory()) {
      throw new Error(`Extra overlay root does not exist: ${extraRoot}`);
    }
    extraOverlayRoots.push(extraRoot);
  }
  const discoveredRoles = await listDirectories(overlaysRoot);
  const unknownRoles = discoveredRoles.filter(
    (role) => !WEARABLE_ROLES.includes(role),
  );
  if (unknownRoles.length > 0) {
    throw new Error(
      `Unknown overlay roles in source package: ${unknownRoles.join(", ")}`,
    );
  }

  // The source catalog is the authority on which options and timelines must
  // exist. Directory discovery alone would let a wholly missing timeline vanish
  // from the registry, silently hiding a wearable for one drink.
  const catalog = await readJson(path.join(sourceRoot, "catalog.json"));
  const expectedOptions = catalog.options ?? {};
  const expectedTimelines = catalog.timelines ?? [];
  const expectedColors = catalog.colors ?? [];
  if (
    JSON.stringify([...expectedColors].sort()) !==
    JSON.stringify([...SLIME_COLORS].sort())
  ) {
    throw new Error(
      `Composition catalog colors changed: ${expectedColors.join(", ")}. ` +
        `This importer expects ${SLIME_COLORS.join(", ")}.`,
    );
  }
  /**
   * Options contributed by a vendored bridge root, keyed by role. They are not
   * in the external catalog yet, so they are validated against the bridge rather
   * than treated as undeclared.
   */
  const extraTimelinesByOption = new Map();
  for (const extraRoot of extraOverlayRoots) {
    for (const role of await listDirectories(extraRoot)) {
      if (!WEARABLE_ROLES.includes(role)) {
        throw new Error(
          `Unknown overlay role in extra source ${extraRoot}: ${role}`,
        );
      }
      for (const option of await listDirectories(path.join(extraRoot, role))) {
        const timelines = await listDirectories(
          path.join(extraRoot, role, option),
        );
        extraTimelinesByOption.set(`${role}/${option}`, {
          root: extraRoot,
          timelines,
        });
      }
    }
  }

  for (const role of WEARABLE_ROLES) {
    const options = expectedOptions[role];
    if (!Array.isArray(options) || options.length === 0) {
      throw new Error(
        `Composition catalog declares no options for role ${role}`,
      );
    }
    const present = await listDirectories(path.join(overlaysRoot, role));
    const missing = options.filter((option) => !present.includes(option));
    if (missing.length > 0) {
      throw new Error(
        `Missing ${role} option directories: ${missing.join(", ")}`,
      );
    }
    const unexpected = present.filter((option) => !options.includes(option));
    if (unexpected.length > 0) {
      throw new Error(
        `Undeclared ${role} option directories: ${unexpected.join(", ")}`,
      );
    }
    // The bridge may add timelines to a catalog option (a jump track for an
    // existing hat), but it must never redeclare a timeline the catalog already
    // publishes, or the two sources would silently compete.
    for (const option of options) {
      const extra = extraTimelinesByOption.get(`${role}/${option}`);
      if (!extra) continue;
      const published = await listDirectories(
        path.join(overlaysRoot, role, option),
      );
      const collisions = extra.timelines.filter((timeline) =>
        published.includes(timeline),
      );
      if (collisions.length > 0) {
        throw new Error(
          `Extra overlay source redeclares published ${role}/${option} timelines: ${collisions.join(", ")}. ` +
            "Delete the vendored bridge entry once the external package publishes it.",
        );
      }
    }
  }

  const entries = [];
  let verifiedFrameCount = 0;
  const droppedDerivedSheets = [];
  for (const role of WEARABLE_ROLES) {
    if (!discoveredRoles.includes(role)) continue;
    // One option may draw timelines from the published catalog and from the
    // vendored bridge at once: an authored hat gets its idle and drink tracks from
    // the catalog and its jump tracks from the bridge.
    const optionRoots = new Map();
    const roots = [overlaysRoot, ...extraOverlayRoots];
    for (const root of roots) {
      if (!(await exists(path.join(root, role)))) continue;
      for (const option of await listDirectories(path.join(root, role))) {
        const existing = optionRoots.get(option) ?? [];
        existing.push(root);
        optionRoots.set(option, existing);
      }
    }

    for (const [option, sources] of [...optionRoots.entries()].sort()) {
      const cells = [];
      const seen = new Set();
      for (const root of sources) {
        for (const timeline of await listDirectories(
          path.join(root, role, option),
        )) {
          if (seen.has(timeline)) continue;
          const cell = await readTimelineCell(
            root,
            root,
            role,
            option,
            timeline,
          );
          if (!cell) continue;
          seen.add(timeline);
          cells.push(cell);
        }
      }
      if (cells.length === 0) continue;
      // Catalog-published options must satisfy the full contract; bridge-only
      // options (the growth crowns) are validated against what they carry.
      const fromCatalog = sources.includes(overlaysRoot);

      if (IDLE_DERIVED_ROLES.has(role)) {
        // Catalog options must cover the idle timeline plus every declared drink.
        // Actions beyond that (happy, the two jump floors, ball-hit) are optional:
        // an option without them has its head layer suppressed for that action
        // rather than blocking the import.
        const requiredTimelines = fromCatalog ? expectedTimelines : ["idle"];
        const presentTimelines = cells.map((cell) => cell.timeline);
        const missingTimelines = requiredTimelines.filter(
          (timeline) => !presentTimelines.includes(timeline),
        );
        if (missingTimelines.length > 0) {
          throw new Error(
            `${role}/${option} is missing timelines: ${missingTimelines.join(", ")}`,
          );
        }
        const idleCell = cells.find((cell) => cell.timeline === "idle");
        if (!idleCell) {
          throw new Error(
            `Wearable option ${role}/${option} has no idle timeline to derive from`,
          );
        }
        const idleDigests = new Set(
          idleCell.variants.map((variant) => variant.digest),
        );
        if (idleDigests.size !== 1) {
          throw new Error(
            `Idle overlay pixels differ across colors for ${role}/${option}. ` +
              "The color dimension can no longer be collapsed; update this importer deliberately.",
          );
        }
        // Only timelines declared as replaying the idle sheet are derived; the
        // rest keep their own sheet, so there is nothing to verify.
        const derived = cells.filter(
          (cell) =>
            timelineSpec(cell.timeline).derivesFrom === "idle" &&
            cell.timeline !== "idle",
        );
        verifiedFrameCount += await verifyIdleDerivation(
          role,
          option,
          idleCell,
          derived,
        );
        droppedDerivedSheets.push(
          ...derived.map((cell) => `${role}/${option}/${cell.timeline}`),
        );
        const entry = buildEntry(role, option, cells);
        entry.vendored = !fromCatalog;
        entries.push(validateEntry(entry));
        continue;
      }

      const entry = buildEntry(role, option, cells);
      if (cells.length !== 1) {
        throw new Error(
          `Color-sensitive role ${role}/${option} must declare exactly one timeline, found ${cells.length}`,
        );
      }
      // A drink option's only timeline must be its own flavor.
      if (cells[0].timeline !== `drink-${option}`) {
        throw new Error(
          `Drink option ${option} declares timeline ${cells[0].timeline}, expected drink-${option}`,
        );
      }
      entries.push(validateEntry(entry));
    }
  }

  if (entries.length === 0)
    throw new Error("No overlay entries were discovered");

  /**
   * Growth crowns are recovered from legacy crowned sheets and therefore only
   * carry authored idle/happy pixels. Their drink motion is not new crown art:
   * every ordinary headwear option uses the same flavor-specific character
   * anchor track while replaying its own idle sheet. Assert that shared contract
   * first, then attach those tracks to each vendored crown explicitly.
   */
  const drinkTimelineKeys = expectedTimelines
    .filter((timeline) => timeline.startsWith("drink-"))
    .map(timelineKey);
  const catalogHeadwear = entries.filter(
    (entry) => entry.role === "headwear" && !entry.vendored,
  );
  for (const key of drinkTimelineKeys) {
    const candidates = catalogHeadwear
      .map((entry) => entry.timelines[key])
      .filter(Boolean);
    if (candidates.length === 0) {
      throw new Error(
        `No published headwear supplies the shared ${key} anchor track`,
      );
    }
    const signatures = new Set(
      candidates.map((timeline) => JSON.stringify(timeline.tracksByColor)),
    );
    if (signatures.size !== 1) {
      throw new Error(
        `Published headwear disagrees on the shared ${key} anchor track; ` +
          "growth crowns cannot derive it safely",
      );
    }
    const sharedTracks = candidates[0].tracksByColor;
    for (const crown of entries.filter(
      (entry) => entry.role === "headwear" && entry.vendored,
    )) {
      crown.timelines[key] = {
        sheet: "idle",
        tracksByColor: Object.fromEntries(
          SLIME_COLORS.map((color) => [
            color,
            sharedTracks[color].map((anchor) => ({ ...anchor })),
          ]),
        ),
      };
      validateEntry(crown);
    }
  }

  const stagingParent = path.join(projectRoot, ".codex", "artifacts");
  await fs.mkdir(stagingParent, { recursive: true });
  const stagingRoot = await fs.mkdtemp(
    path.join(stagingParent, "slime-wearables-import-"),
  );
  try {
    webRoot = path.join(stagingRoot, "web");
    mobileRoot = path.join(stagingRoot, "mobile");
    webRegistryPath = path.join(stagingRoot, "slime-wearables.generated.ts");
    mobileRegistryPath = path.join(
      stagingRoot,
      "slime-wearables.mobile.generated.ts",
    );
    await fs.cp(canonicalWebRoot, webRoot, { recursive: true, force: true });
    await fs.cp(canonicalMobileRoot, mobileRoot, {
      recursive: true,
      force: true,
    });

    assertProjectOutput(webRoot);
    assertProjectOutput(mobileRoot);
    // Clean only the option directories this importer owns. The crown importer
    // writes additional headwear options into the same tree, so wiping the whole
    // composition root here would make the two scripts order-dependent.
    for (const entry of entries) {
      for (const root of [webRoot, mobileRoot]) {
        const owned = path.join(root, entry.role, entry.option);
        assertProjectOutput(owned);
        await fs.rm(owned, { recursive: true, force: true });
      }
    }

    let writtenSheets = 0;
    for (const entry of entries) {
      const colorSensitive = !IDLE_DERIVED_ROLES.has(entry.role);
      for (const [timeline, sheet] of entry.sheets) {
        const metadata = sheetMetadata(sheet.durations, sheet.canvasHeight);
        // Color-independent roles collapse to one sheet per timeline; the
        // color-sensitive drink role keeps a sheet per color.
        const targets = colorSensitive
          ? SLIME_COLORS.map((color) => [
              path.join(entry.role, entry.option, timeline, color),
              sheet.buffersByColor[color],
            ])
          : [
              [
                path.join(entry.role, entry.option, timeline),
                Object.values(sheet.buffersByColor)[0],
              ],
            ];
        for (const [relativeDir, buffer] of targets) {
          const webDir = path.join(webRoot, relativeDir);
          await fs.mkdir(webDir, { recursive: true });
          await fs.writeFile(path.join(webDir, "sheet.png"), buffer);
          await writeJson(path.join(webDir, "sheet.json"), metadata);
          await generateNearestFourX(
            buffer,
            path.join(mobileRoot, relativeDir, "sheet.png"),
          );
          await writeJson(
            path.join(mobileRoot, relativeDir, "sheet.json"),
            metadata,
          );
          writtenSheets += 1;
        }
      }
    }

    entries.sort((a, b) => a.key.localeCompare(b.key));
    await writeChunkedRegistry({
      outputPath: webRegistryPath,
      approvedRoots: [stagingRoot],
      allowedBaseNames: ["slime-wearables.generated.ts"],
      banner:
        "// Generated by scripts/import-slime-wearables.mjs. Do not edit by hand.",
      registries: [
        {
          name: "SLIME_WEB_WEARABLE_REGISTRY",
          filePrefix: "wearables",
          entries: entries.map((entry) => [
            entry.key,
            entryLiteral(entry, webSheetsField(entry)),
          ]),
        },
      ],
      constants: [
        {
          name: "SLIME_WEARABLE_LAYER_ORDER",
          value: ["slime", ...WEARABLE_ROLES],
        },
      ],
    });
    await fs.writeFile(
      mobileRegistryPath,
      renderMobileRegistry(entries),
      "utf8",
    );
    const stagedMobileLib = path.join(stagingRoot, "mobile-lib");
    await stageMobileGeneratedRegistry({
      filename: "slime-wearables.generated.ts",
      sourcePath: mobileRegistryPath,
      stagingLibRoot: stagedMobileLib,
    });
    if (process.env.SLIME_IMPORT_FAIL_AT === "after-validation") {
      throw new Error(
        "Forced failure after staged wearable and registry validation",
      );
    }
    const stagedWebChunks = path.join(
      stagingRoot,
      "slime-wearables.generated.chunks",
    );
    const canonicalWebChunks = path.join(
      projectRoot,
      "src",
      "lib",
      "pets",
      "slime-wearables.generated.chunks",
    );
    const publicationItems = [
      { source: webRoot, target: canonicalWebRoot },
      { source: mobileRoot, target: canonicalMobileRoot },
      { source: webRegistryPath, target: canonicalWebRegistryPath },
      { source: stagedWebChunks, target: canonicalWebChunks },
      ...mobileRegistryPublicationItems({
        filename: "slime-wearables.generated.ts",
        stagingLibRoot: stagedMobileLib,
        targetLibRoot: path.dirname(canonicalMobileRegistryPath),
      }),
    ];
    await publishSlimeWearablesImportOutputs(
      publicationItems,
      stagingRoot,
      process.env.SLIME_IMPORT_FAIL_AT,
    );

    const sourceOverlayFiles = entries.reduce(
      (total, entry) =>
        total + Object.keys(entry.timelines).length * SLIME_COLORS.length,
      0,
    );
    const anchorOverrides = entries.flatMap((entry) =>
      Object.entries(entry.timelines).flatMap(([key, timeline]) => {
        const payload = timelinePayload(timeline);
        return Object.keys(payload.anchorOverridesByColor ?? {}).map(
          (color) => `${entry.key} ${key} (${color})`,
        );
      }),
    );
    const report = {
      source: sourceRoot,
      sourceOverlayFiles,
      importedSheets: writtenSheets,
      reductionRatio: Number((writtenSheets / sourceOverlayFiles).toFixed(4)),
      verifiedDerivedFrames: verifiedFrameCount,
      droppedDerivedSheets: droppedDerivedSheets.length,
      byRole: Object.fromEntries(
        WEARABLE_ROLES.map((role) => [
          role,
          entries.filter((entry) => entry.role === role).length,
        ]),
      ),
      publishedRoles: WEARABLE_ROLES.filter(
        (role) => !UNPUBLISHED_ROLES.has(role),
      ),
      unpublishedRoles: [...UNPUBLISHED_ROLES],
      anchorOverrides,
      generated: {
        webRoot: toPosix(path.relative(projectRoot, canonicalWebRoot)),
        mobileRoot: toPosix(path.relative(projectRoot, canonicalMobileRoot)),
        webRegistry: toPosix(
          path.relative(projectRoot, canonicalWebRegistryPath),
        ),
        mobileRegistry: toPosix(
          path.relative(projectRoot, canonicalMobileRegistryPath),
        ),
      },
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    webRoot = canonicalWebRoot;
    mobileRoot = canonicalMobileRoot;
    webRegistryPath = canonicalWebRegistryPath;
    mobileRegistryPath = canonicalMobileRegistryPath;
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { main };
