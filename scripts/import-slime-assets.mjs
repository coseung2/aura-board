#!/usr/bin/env node

/**
 * Import the SlimeAssets source package into the web and Expo asset roots.
 *
 * The source directory is deliberately a command-line input.  Generated
 * registries contain only project-local URLs and relative Metro requires, so
 * the source package is never a runtime dependency.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeChunkedRegistry } from "../src/lib/pets/chunked-registry-writer.mjs";
import {
  mobileRegistryPublicationItems,
  publishStagedFileSet,
  stageMobileGeneratedRegistry,
} from "../apps/mobile/scripts/split-generated-slime-registries.mjs";
import {
  SLIME_ACTIONS,
  SLIME_COLORS,
  SLIME_DRINK_ACTIONS,
  SLIME_DRINK_FLAVORS,
  SLIME_EVOLUTIONS,
  SLIME_PLAYBACK_BY_ACTION,
  slimeExpectedActionsForEvolution,
} from "../src/lib/pets/slime-asset-import-contract.mjs";
import { renderMobileSlimeRegistry } from "./slime-asset-mobile-registry-renderer.mjs";
import {
  asepriteAvailable,
  classifyCompositionBase,
  classifySpriteJson,
  compareEntries,
  copyFile,
  exists,
  exportHappyLayers,
  generateCrownOverlay,
  generateNearestFourX,
  overlayKeyFor,
  parseMetadata,
  readExistingHappyHeartOverlays,
  toPosix,
  walk,
  writeJson,
} from "./slime-asset-import-helpers.mjs";

export {
  SLIME_ACTIONS,
  SLIME_COLORS,
  SLIME_DRINK_ACTIONS,
  SLIME_DRINK_FLAVORS,
  SLIME_EVOLUTIONS,
  SLIME_PLAYBACK_BY_ACTION,
  slimeExpectedActionsForEvolution,
};

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
);
const canonicalMobileRoot = path.join(
  projectRoot,
  "apps",
  "mobile",
  "assets",
  "slimes",
);
let webRoot = canonicalWebRoot;
let mobileRoot = canonicalMobileRoot;
function assertProjectOutput(outputRoot) {
  const relative = path.relative(projectRoot, outputRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Refusing to replace slime assets outside the project: ${outputRoot}`,
    );
  }
}

function webEntryLiteral(entry) {
  return {
    key: entry.key,
    evolution: entry.evolution,
    color: entry.color,
    action: entry.action,
    sheetUrl: `/creatures/slimes/official/${entry.key}/sheet.png`,
    metadata: entry.metadata,
  };
}

async function main(argv = process.argv.slice(2)) {
  const wantsHelp = argv.includes("--help") || argv.includes("-h");
  const forceSkipHappySplit = argv.includes("--skip-happy-split");
  const positional = argv.filter((value) => !value.startsWith("-"));
  const sourceArgument = positional[0];
  if (!sourceArgument || positional.length !== 1 || wantsHelp) {
    console.error(
      "Usage: node scripts/import-slime-assets.mjs <source> [--skip-happy-split]",
    );
    if (wantsHelp) return;
    process.exitCode = 2;
    return;
  }
  const happySplitRequested = forceSkipHappySplit ? false : null;

  const sourceRoot = path.resolve(sourceArgument);
  const sourceStat = await fs.stat(sourceRoot).catch(() => null);
  if (!sourceStat?.isDirectory())
    throw new Error(
      `Slime asset source directory does not exist: ${sourceRoot}`,
    );
  const sourceRealRoot = await fs.realpath(sourceRoot);
  const projectRealRoot = await fs.realpath(projectRoot);
  if (
    sourceRealRoot === projectRealRoot ||
    sourceRealRoot.startsWith(`${projectRealRoot}${path.sep}`)
  ) {
    throw new Error(
      "Slime asset source must be external to the project runtime roots",
    );
  }

  /**
   * Whether to skip splitting the heart out of the happy animation.
   *
   * That split is the only step needing the Aseprite CLI. Without it the previous
   * happy output is preserved, which keeps an unrelated re-import possible on a
   * machine that has no Aseprite installed. Pass `--skip-happy-split` to force it.
   */
  const skipHappyLayerSplit =
    happySplitRequested === false || !(await asepriteAvailable());
  if (skipHappyLayerSplit) {
    console.error(
      "Skipping the happy heart layer split; reusing the existing happy output. " +
        "Set ASEPRITE_BIN to a working Aseprite executable to regenerate it.",
    );
  }

  // Composition overlays and backups intentionally repeat canonical action
  // names, so the tree is filtered rather than scanned wholesale.
  const files = (await walk(sourceRoot)).filter((filePath) => {
    const relative = toPosix(path.relative(sourceRoot, filePath));
    if (relative.startsWith("backups/")) return false;
    if (relative.startsWith("props/")) {
      // Drink-free character timelines are the only thing wanted from `props/`.
      // The legacy `props/drink/<flavor>` sheets have the drink baked in, which is
      // what used to leave a lemonade glass under every drink animation.
      return relative.startsWith("props/composition/base/drink-");
    }
    return true;
  });
  const discovered = files
    .map(
      (filePath) =>
        // Drink-free character timelines come from the composition package; every
        // other action still comes from its authored `*-sheet.json`.
        classifyCompositionBase(sourceRoot, filePath) ??
        classifySpriteJson(sourceRoot, filePath),
    )
    .filter(Boolean)
    .sort(compareEntries);
  const byKey = new Map();
  for (const item of discovered) {
    if (byKey.has(item.key))
      throw new Error(`Duplicate normalized asset key: ${item.key}`);
    byKey.set(item.key, item);
  }
  const expectedKeys = SLIME_EVOLUTIONS.flatMap((evolution) =>
    SLIME_COLORS.flatMap((color) =>
      slimeExpectedActionsForEvolution(evolution).map(
        (action) => `${evolution}/${color}/${action}`,
      ),
    ),
  );
  const missing = expectedKeys.filter((key) => !byKey.has(key));
  if (missing.length > 0)
    throw new Error(`Missing expected source assets: ${missing.join(", ")}`);
  const unexpected = discovered.filter(
    (item) => !expectedKeys.includes(item.key),
  );
  if (unexpected.length > 0)
    throw new Error(
      `Unexpected normalized source assets: ${unexpected.map((item) => item.key).join(", ")}`,
    );

  // Build against complete copies of the current output trees. Other importers
  // own composition overlays, props, and static floors inside these roots, so a
  // full-tree staging copy preserves their files while this importer replaces
  // only its own character/crown directories. A failure from here onward leaves
  // every canonical output untouched.
  const stagingParent = path.join(projectRoot, ".codex", "artifacts");
  await fs.mkdir(stagingParent, { recursive: true });
  const stagingRoot = await fs.mkdtemp(
    path.join(stagingParent, "slime-import-"),
  );
  try {
    webRoot = path.join(stagingRoot, "web");
    mobileRoot = path.join(stagingRoot, "mobile");
    await fs.cp(canonicalWebRoot, webRoot, { recursive: true, force: true });
    await fs.cp(canonicalMobileRoot, mobileRoot, {
      recursive: true,
      force: true,
    });

    const entries = [];
    const happyHeartOverlays = [];
    assertProjectOutput(webRoot);
    assertProjectOutput(mobileRoot);
    // Other importers own composition overlays, ball props, and static floors
    // under these roots. Replace only the legacy character/crown outputs.
    for (const outputRoot of [webRoot, mobileRoot]) {
      for (const evolution of SLIME_EVOLUTIONS) {
        await fs.rm(path.join(outputRoot, evolution), {
          recursive: true,
          force: true,
        });
      }
      // Crown overlays are regenerated below. The happy-heart overlay is only
      // regenerated when the Aseprite split runs, so it is preserved otherwise
      // rather than deleted and left missing.
      for (const evolution of SLIME_EVOLUTIONS.filter(
        (item) => item !== "base",
      )) {
        await fs.rm(path.join(outputRoot, "overlays", evolution), {
          recursive: true,
          force: true,
        });
      }
      if (!skipHappyLayerSplit) {
        await fs.rm(path.join(outputRoot, "overlays", "happy-heart"), {
          recursive: true,
          force: true,
        });
      }
    }
    for (const item of discovered) {
      const parsed = JSON.parse(await fs.readFile(item.filePath, "utf8"));
      const metadata = parseMetadata(item.relative, parsed, sourceRoot);
      const sourceSheet = item.sheetPath;
      const sourceSheet4x = item.sheet4xPath;
      if (!(await exists(sourceSheet)))
        throw new Error(`Missing canonical sheet PNG for ${item.relative}`);
      const webDir = path.join(webRoot, item.key);
      const mobileDir = path.join(mobileRoot, item.key);
      let layerExport = null;
      try {
        let importedSheet = sourceSheet;
        let importedSheet4x = sourceSheet4x;
        let importedMetadata = { frames: metadata.frames, meta: metadata.meta };
        // Splitting the heart out of the happy animation needs the Aseprite CLI.
        // When it is unavailable the previously imported happy output is reused, so
        // an unrelated import (such as refreshing the drink character sheets) is not
        // blocked by a missing local tool.
        const canSplitHappy =
          item.evolution === "base" &&
          item.action === "happy" &&
          !skipHappyLayerSplit;
        if (canSplitHappy) {
          const sourceProject = item.projectPath;
          if (!(await exists(sourceProject)))
            throw new Error(`Missing layered happy source: ${sourceProject}`);
          layerExport = await exportHappyLayers(
            sourceProject,
            sourceSheet,
            item.relative,
          );
          importedSheet = layerExport.bodySheet;
          importedSheet4x = null;
          importedMetadata = layerExport.bodyMetadata;

          const happyOverlayKey = overlayKeyFor({
            evolution: item.evolution,
            color: item.color,
          });
          const overlayWebDir = path.join(
            webRoot,
            "overlays",
            "happy-heart",
            happyOverlayKey,
          );
          const overlayMobileDir = path.join(
            mobileRoot,
            "overlays",
            "happy-heart",
            happyOverlayKey,
          );
          await copyFile(
            layerExport.heartSheet,
            path.join(overlayWebDir, "sheet.png"),
          );
          await writeJson(
            path.join(overlayWebDir, "sheet.json"),
            layerExport.heartMetadata,
          );
          await generateNearestFourX(
            layerExport.heartSheet,
            path.join(overlayMobileDir, "sheet.png"),
          );
          await writeJson(
            path.join(overlayMobileDir, "sheet.json"),
            layerExport.heartMetadata,
          );
          happyHeartOverlays.push({
            key: happyOverlayKey,
            evolution: item.evolution,
            color: item.color,
            metadata: layerExport.heartMetadata,
          });
        }

        await copyFile(importedSheet, path.join(webDir, "sheet.png"));
        await writeJson(path.join(webDir, "sheet.json"), importedMetadata);
        if (importedSheet4x && (await exists(importedSheet4x)))
          await copyFile(importedSheet4x, path.join(mobileDir, "sheet.png"));
        else
          await generateNearestFourX(
            importedSheet,
            path.join(mobileDir, "sheet.png"),
          );
        await writeJson(path.join(mobileDir, "sheet.json"), importedMetadata);
        entries.push({ ...item, metadata: importedMetadata });
      } finally {
        if (layerExport)
          await fs.rm(layerExport.temporaryRoot, {
            recursive: true,
            force: true,
          });
      }
    }

    const sharedPuddleJson = path.join(
      sourceRoot,
      "floors",
      "water-puddle",
      "shared-effects",
      "water-puddle-sheet.json",
    );
    const sharedPuddlePng = path.join(
      sourceRoot,
      "floors",
      "water-puddle",
      "shared-effects",
      "water-puddle-sheet.png",
    );
    const grassPng = path.join(
      sourceRoot,
      "floors",
      "grass-floor",
      "grass-floor.png",
    );
    const cookiePng = path.join(
      sourceRoot,
      "food",
      "cookie",
      "cookie-shop-icon-256.png",
    );
    for (const [label, filePath] of [
      ["grass", grassPng],
      ["cookie", cookiePng],
    ])
      if (!(await exists(filePath)))
        throw new Error(`Missing shared ${label} asset: ${filePath}`);
    await copyFile(grassPng, path.join(webRoot, "shared", "grass-floor.png"));
    await copyFile(
      cookiePng,
      path.join(webRoot, "shared", "cookie-shop-icon-256.png"),
    );
    await generateNearestFourX(
      grassPng,
      path.join(mobileRoot, "shared", "grass-floor.png"),
    );
    await copyFile(
      cookiePng,
      path.join(mobileRoot, "shared", "cookie-shop-icon-256.png"),
    );
    let sharedPuddle = null;
    if ((await exists(sharedPuddleJson)) && (await exists(sharedPuddlePng))) {
      const parsed = parseMetadata(
        "floors/water-puddle/shared-effects/water-puddle-sheet.json",
        JSON.parse(await fs.readFile(sharedPuddleJson, "utf8")),
      );
      await copyFile(
        sharedPuddlePng,
        path.join(webRoot, "shared", "water-puddle", "sheet.png"),
      );
      await writeJson(
        path.join(webRoot, "shared", "water-puddle", "sheet.json"),
        { frames: parsed.frames, meta: parsed.meta },
      );
      await generateNearestFourX(
        sharedPuddlePng,
        path.join(mobileRoot, "shared", "water-puddle", "sheet.png"),
      );
      await writeJson(
        path.join(mobileRoot, "shared", "water-puddle", "sheet.json"),
        { frames: parsed.frames, meta: parsed.meta },
      );
      sharedPuddle = { frames: parsed.frames, meta: parsed.meta };
    }

    const overlays = [];
    for (const evolution of SLIME_EVOLUTIONS.filter(
      (item) => item !== "base",
    )) {
      for (const color of SLIME_COLORS) {
        // The legacy crown diff only ever had a lemonade pair to compare. Runtime
        // crowns now come from `import-slime-crowns.mjs`; these overlays remain
        // because the mobile asset validator still expects them on disk.
        const base = byKey.get(`base/${color}/drink-lemonade`);
        const crowned = byKey.get(`${evolution}/${color}/drink-lemonade`);
        const overlayKey = overlayKeyFor({ evolution, color });
        const outputWeb = path.join(
          webRoot,
          "overlays",
          overlayKey,
          "overlay.png",
        );
        const outputMobile = path.join(
          mobileRoot,
          "overlays",
          overlayKey,
          "overlay.png",
        );
        const result = await generateCrownOverlay(
          base.sheetPath,
          crowned.sheetPath,
          outputWeb,
          outputMobile,
        );
        overlays.push({
          key: overlayKey,
          differingPixels: result.differingPixels,
        });
      }
    }
    overlays.sort((a, b) => a.key.localeCompare(b.key));
    happyHeartOverlays.sort((a, b) => a.key.localeCompare(b.key));
    if (skipHappyLayerSplit) {
      // The split did not run, so carry the previously generated entries forward.
      // Dropping them would leave the runtime without a happy overlay even though
      // its art is still on disk.
      happyHeartOverlays.push(
        ...(await readExistingHappyHeartOverlays(webRoot)),
      );
      happyHeartOverlays.sort((a, b) => a.key.localeCompare(b.key));
    }

    const shared = {
      grassFloor: {
        key: "grass-floor",
        imageUrl: "/creatures/slimes/official/shared/grass-floor.png",
        imageScale: 1,
        surfaceY: 44,
        slimeFootY: 56,
      },
      cookie: {
        key: "cookie-shop-icon-256",
        imageUrl: "/creatures/slimes/official/shared/cookie-shop-icon-256.png",
        imageScale: 1,
      },
      sharedPuddle: sharedPuddle
        ? {
            key: "shared-water-puddle",
            sheetUrl:
              "/creatures/slimes/official/shared/water-puddle/sheet.png",
            imageScale: 1,
            metadata: sharedPuddle,
          }
        : null,
    };
    const stagedWebRegistry = path.join(
      stagingRoot,
      "slime-assets.generated.ts",
    );
    const stagedWebChunks = path.join(
      stagingRoot,
      "slime-assets.generated.chunks",
    );
    const stagedMobileRegistry = path.join(
      stagingRoot,
      "slime-assets.mobile.generated.ts",
    );
    const canonicalWebRegistry = path.join(
      projectRoot,
      "src",
      "lib",
      "pets",
      "slime-assets.generated.ts",
    );
    const canonicalMobileRegistry = path.join(
      projectRoot,
      "apps",
      "mobile",
      "lib",
      "slime-assets.generated.ts",
    );
    await writeChunkedRegistry({
      outputPath: stagedWebRegistry,
      approvedRoots: [stagingRoot],
      allowedBaseNames: ["slime-assets.generated.ts"],
      banner:
        "// Generated by scripts/import-slime-assets.mjs. Do not edit by hand.",
      registries: [
        {
          name: "SLIME_WEB_ASSET_REGISTRY",
          filePrefix: "assets",
          entries: entries.map((entry) => [entry.key, webEntryLiteral(entry)]),
        },
        {
          name: "SLIME_WEB_CROWN_OVERLAY_REGISTRY",
          filePrefix: "crowns",
          entries: overlays.map((overlay) => [
            overlay.key,
            {
              key: overlay.key,
              imageUrl: `/creatures/slimes/official/overlays/${overlay.key}/overlay.png`,
              imageScale: 1,
              differingPixels: overlay.differingPixels,
            },
          ]),
        },
        {
          name: "SLIME_WEB_HAPPY_HEART_OVERLAY_REGISTRY",
          filePrefix: "happy-hearts",
          entries: happyHeartOverlays.map((overlay) => [
            overlay.key,
            {
              key: overlay.key,
              evolution: overlay.evolution,
              color: overlay.color,
              action: "happy",
              imageUrl: `/creatures/slimes/official/overlays/happy-heart/${overlay.key}/sheet.png`,
              imageScale: 1,
              metadata: overlay.metadata,
            },
          ]),
        },
      ],
      constants: [{ name: "SLIME_WEB_SHARED_ASSETS", value: shared }],
    });
    await fs.writeFile(
      stagedMobileRegistry,
      renderMobileSlimeRegistry(entries, overlays, happyHeartOverlays, shared, {
        actions: SLIME_ACTIONS,
        colors: SLIME_COLORS,
        evolutions: SLIME_EVOLUTIONS,
        playbackByAction: SLIME_PLAYBACK_BY_ACTION,
      }),
      "utf8",
    );

    const stagedMobileLib = path.join(stagingRoot, "mobile-lib");
    await stageMobileGeneratedRegistry({
      filename: "slime-assets.generated.ts",
      sourcePath: stagedMobileRegistry,
      stagingLibRoot: stagedMobileLib,
    });
    if (process.env.SLIME_IMPORT_FAIL_AT === "after-validation") {
      throw new Error(
        "Forced failure after staged asset and registry validation",
      );
    }
    const publicationItems = [
      { source: webRoot, target: canonicalWebRoot },
      { source: mobileRoot, target: canonicalMobileRoot },
      { source: stagedWebRegistry, target: canonicalWebRegistry },
      {
        source: stagedWebChunks,
        target: path.join(
          projectRoot,
          "src",
          "lib",
          "pets",
          "slime-assets.generated.chunks",
        ),
      },
      ...mobileRegistryPublicationItems({
        filename: "slime-assets.generated.ts",
        stagingLibRoot: stagedMobileLib,
        targetLibRoot: path.dirname(canonicalMobileRegistry),
      }),
    ];
    await publishSlimeAssetImportOutputs(
      publicationItems,
      stagingRoot,
      process.env.SLIME_IMPORT_FAIL_AT,
    );

    const report = {
      source: sourceRoot,
      coloredEntries: entries.length,
      entriesByEvolution: Object.fromEntries(
        SLIME_EVOLUTIONS.map((evolution) => [
          evolution,
          entries.filter((entry) => entry.evolution === evolution).length,
        ]),
      ),
      entriesByAction: Object.fromEntries(
        SLIME_ACTIONS.map((action) => [
          action,
          entries.filter((entry) => entry.action === action).length,
        ]),
      ),
      crownOverlays: overlays.length,
      happyHeartOverlays: happyHeartOverlays.length,
      sharedPuddle: Boolean(sharedPuddle),
      generated: {
        webRoot: toPosix(path.relative(projectRoot, canonicalWebRoot)),
        mobileRoot: toPosix(path.relative(projectRoot, canonicalMobileRoot)),
      },
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    webRoot = canonicalWebRoot;
    mobileRoot = canonicalMobileRoot;
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

export async function publishSlimeAssetImportOutputs(
  items,
  stagingRoot,
  failAt = null,
) {
  try {
    publishStagedFileSet(items, stagingRoot, {
      approvedTargets: items.map((item) => item.target),
      failAt,
    });
  } finally {
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
