import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { splitGeneratedSlimeRegistries } from "./split-generated-slime-registries.mjs";
import { publishSlimeAssetImportOutputs } from "../../../scripts/import-slime-assets.mjs";
import { publishSlimeWearableActionsImportOutputs } from "../../../scripts/import-slime-wearable-actions.mjs";
import { publishSlimeWearablesImportOutputs } from "../../../scripts/import-slime-wearables.mjs";

const fixtures = [];

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((fixture) => fs.rm(fixture, { recursive: true, force: true })),
  );
});

async function fixture(prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  fixtures.push(root);
  return root;
}

async function pathExists(filePath) {
  return fs.access(filePath).then(
    () => true,
    () => false,
  );
}

async function snapshot(root) {
  const entries = [];
  async function visit(directory) {
    const children = await fs.readdir(directory, { withFileTypes: true });
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, child.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (child.isDirectory()) {
        entries.push([`${relative}/`, "directory"]);
        await visit(absolute);
      } else {
        const digest = createHash("sha256")
          .update(await fs.readFile(absolute))
          .digest("hex");
        entries.push([relative, digest]);
      }
    }
  }
  if (await pathExists(root)) await visit(root);
  return entries;
}

function fixtureMonolith(revision) {
  const registry = Object.fromEntries(
    Array.from({ length: 28 }, (_, index) => [
      `item-${String(index).padStart(2, "0")}`,
      {
        key: `item-${index}`,
        revision,
        metadata: {
          frames: Array.from({ length: 12 }, (__, frame) => ({
            filename: `${frame}`,
            frame: { x: frame * 16, y: 0, w: 16, h: 16 },
            duration: 80 + frame,
          })),
        },
      },
    ]),
  );
  return [
    "// Generated fixture monolith.",
    "",
    `export const SLIME_MOBILE_ASSET_REGISTRY = ${JSON.stringify(registry, null, 2)} as const;`,
    "",
  ].join("\n");
}

async function assertNoSplitterStage(parent) {
  const entries = await fs.readdir(parent);
  assert.deepEqual(
    entries.filter((entry) => entry.startsWith(".slime-registry-staging-")),
    [],
  );
}

test("splitter keeps canonical hashes and inventory exact on every forced failure", async () => {
  const root = await fixture("aura-mobile-splitter-");
  const libRoot = path.join(root, "lib");
  const filename = "slime-assets.generated.ts";
  await fs.mkdir(libRoot);
  await fs.writeFile(path.join(libRoot, filename), fixtureMonolith(1), "utf8");
  await splitGeneratedSlimeRegistries({ libRoot, filenames: [filename] });
  const stable = await snapshot(libRoot);

  for (const failAt of [
    "before-publish",
    "after-validation",
    "after-backup",
    "after-first-install",
  ]) {
    await assert.rejects(
      splitGeneratedSlimeRegistries({ libRoot, filenames: [filename], failAt }),
      /Forced failure/,
    );
    assert.deepEqual(await snapshot(libRoot), stable, failAt);
    await assertNoSplitterStage(root);
  }
});

test("splitter removes stale chunks only after validated publication succeeds", async () => {
  const root = await fixture("aura-mobile-stale-");
  const libRoot = path.join(root, "lib");
  const filename = "slime-assets.generated.ts";
  const stale = path.join(libRoot, "slime-assets.generated.value.chunk-999.ts");
  await fs.mkdir(libRoot);
  await fs.writeFile(path.join(libRoot, filename), fixtureMonolith(1), "utf8");
  await splitGeneratedSlimeRegistries({ libRoot, filenames: [filename] });
  await fs.writeFile(stale, "export const STALE = true;\n", "utf8");
  const withStale = await snapshot(libRoot);

  await assert.rejects(
    splitGeneratedSlimeRegistries({
      libRoot,
      filenames: [filename],
      failAt: "after-validation",
    }),
    /Forced failure/,
  );
  assert.deepEqual(await snapshot(libRoot), withStale);
  assert.equal(await pathExists(stale), true);

  await splitGeneratedSlimeRegistries({ libRoot, filenames: [filename] });
  assert.equal(await pathExists(stale), false);
  await assertNoSplitterStage(root);
});

const importerPublishers = [
  ["assets", publishSlimeAssetImportOutputs],
  ["wearables", publishSlimeWearablesImportOutputs],
  ["wearable-actions", publishSlimeWearableActionsImportOutputs],
];

for (const [label, publish] of importerPublishers) {
  test(`${label} importer publication rolls back and removes its stage`, async () => {
    const root = await fixture(`aura-${label}-publication-`);
    const canonical = path.join(root, "canonical");
    await fs.mkdir(path.join(canonical, "tree"), { recursive: true });
    await fs.writeFile(path.join(canonical, "barrel.ts"), "old barrel\n");
    await fs.writeFile(
      path.join(canonical, "tree", "asset.bin"),
      "old asset\n",
    );
    await fs.writeFile(path.join(canonical, "stale.ts"), "old stale\n");
    const stable = await snapshot(canonical);

    for (const failAt of ["before-publish", "after-first-install"]) {
      const stagingRoot = await fs.mkdtemp(path.join(root, `.${label}-stage-`));
      const stagedTree = path.join(stagingRoot, "tree");
      await fs.mkdir(stagedTree);
      await fs.writeFile(path.join(stagingRoot, "barrel.ts"), "new barrel\n");
      await fs.writeFile(path.join(stagedTree, "asset.bin"), "new asset\n");
      const items = [
        {
          source: path.join(stagingRoot, "barrel.ts"),
          target: path.join(canonical, "barrel.ts"),
        },
        { source: stagedTree, target: path.join(canonical, "tree") },
        { source: null, target: path.join(canonical, "stale.ts") },
      ];
      await assert.rejects(
        publish(items, stagingRoot, failAt),
        /Forced failure/,
      );
      assert.deepEqual(await snapshot(canonical), stable, failAt);
      assert.equal(await pathExists(stagingRoot), false, failAt);
    }
  });
}
