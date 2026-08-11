import { execFile as execFileCallback } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import {
  publishStagedOutputs,
  writeChunkedRegistry,
} from "./chunked-registry-writer.mjs";

const execFile = promisify(execFileCallback);
const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((fixture) => rm(fixture, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aura-web-registry-"));
  fixtures.push(directory);
  return directory;
}

function options(directory: string, entries: Array<[string, unknown]>) {
  return {
    outputPath: path.join(directory, "fixture.generated.ts"),
    approvedRoots: [directory],
    allowedBaseNames: ["fixture.generated.ts"],
    banner: "// Generated fixture.",
    registries: [{ name: "FIXTURE_REGISTRY", filePrefix: "fixture", entries }],
    constants: [
      { name: "FIXTURE_META", value: { revision: 3, enabled: true } },
    ],
    aliases: [{ name: "FIXTURE_ALIAS", target: "FIXTURE_REGISTRY" }],
    maxLines: 40,
    maxBytes: 8 * 1024,
    maxLineLength: 160,
  };
}

async function executeGeneratedRegistry(directory: string) {
  const probe = path.join(directory, "probe.ts");
  await writeFile(
    probe,
    `import { FIXTURE_ALIAS, FIXTURE_META, FIXTURE_REGISTRY } from "./fixture.generated";\nconsole.log(JSON.stringify({ registry: FIXTURE_REGISTRY, alias: FIXTURE_ALIAS, meta: FIXTURE_META }));\n`,
  );
  const tsxCli = path.join(
    process.cwd(),
    "node_modules",
    "tsx",
    "dist",
    "cli.mjs",
  );
  const { stdout } = await execFile(process.execPath, [tsxCli, probe], {
    cwd: directory,
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(stdout.trim());
}

async function snapshot(directory: string) {
  const outputPath = path.join(directory, "fixture.generated.ts");
  const chunkDirectory = path.join(directory, "fixture.generated.chunks");
  const files = await readdir(chunkDirectory);
  return {
    barrel: await readFile(outputPath, "utf8"),
    chunks: Object.fromEntries(
      await Promise.all(
        files.map(async (file) => [
          file,
          await readFile(path.join(chunkDirectory, file), "utf8"),
        ]),
      ),
    ),
  };
}

describe("chunked web registry publication", () => {
  it("preserves every export, key, and value with readable bounded chunks", async () => {
    const directory = await fixture();
    const entries = Array.from(
      { length: 18 },
      (_, index) =>
        [
          `item-${index}`,
          {
            key: `item-${index}`,
            frames: Array.from({ length: 5 }, (__, frame) => ({
              sourceFrame: frame,
              dx: index,
              dy: frame === 0 ? 0 : -frame,
            })),
          },
        ] as [string, unknown],
    );

    await writeChunkedRegistry(options(directory, entries));

    const evaluated = await executeGeneratedRegistry(directory);
    expect(evaluated).toEqual({
      registry: Object.fromEntries(entries),
      alias: Object.fromEntries(entries),
      meta: { revision: 3, enabled: true },
    });
    const generatedFiles = [
      path.join(directory, "fixture.generated.ts"),
      ...(await readdir(path.join(directory, "fixture.generated.chunks"))).map(
        (file) => path.join(directory, "fixture.generated.chunks", file),
      ),
    ];
    for (const file of generatedFiles) {
      const lines = (await readFile(file, "utf8")).split(/\r?\n/);
      expect(lines.length - 1, file).toBeLessThanOrEqual(40);
      expect(
        Math.max(...lines.map((line) => line.length)),
        file,
      ).toBeLessThanOrEqual(160);
    }
  });

  it("removes stale chunks only inside the approved generated directory", async () => {
    const directory = await fixture();
    await writeChunkedRegistry(
      options(directory, [
        ["first", { value: 1 }],
        ["second", { value: 2 }],
      ]),
    );
    const chunkDirectory = path.join(directory, "fixture.generated.chunks");
    const stale = path.join(chunkDirectory, "fixture-stale.generated.ts");
    const sibling = path.join(directory, "keep-me.ts");
    await writeFile(stale, "stale\n");
    await writeFile(sibling, "keep\n");

    await writeChunkedRegistry(options(directory, [["only", { value: 9 }]]));

    await expect(access(stale)).rejects.toThrow();
    expect(await readFile(sibling, "utf8")).toBe("keep\n");
    expect((await executeGeneratedRegistry(directory)).registry).toEqual({
      only: { value: 9 },
    });
  });

  it("leaves the previous output intact after invalid or oversized generation", async () => {
    const directory = await fixture();
    await writeChunkedRegistry(options(directory, [["stable", { value: 1 }]]));
    const before = await snapshot(directory);

    await expect(
      writeChunkedRegistry({
        ...options(directory, [["oversized", { value: "x".repeat(500) }]]),
        maxLineLength: 80,
      }),
    ).rejects.toThrow(/exceeds 80 characters/);
    expect(await snapshot(directory)).toEqual(before);

    const outside = path.join(path.dirname(directory), "fixture.generated.ts");
    await expect(
      writeChunkedRegistry({
        ...options(directory, [["outside", { value: 2 }]]),
        outputPath: outside,
      }),
    ).rejects.toThrow(/outside approved roots/);
    await expect(access(outside)).rejects.toThrow();
    expect(await snapshot(directory)).toEqual(before);
  });

  it("rolls every target back, including stale deletions, after the first install", async () => {
    const directory = await fixture();
    const stagingRoot = path.join(directory, "staging");
    await mkdir(stagingRoot);
    const firstTarget = path.join(directory, "first.ts");
    const secondTarget = path.join(directory, "second.ts");
    const staleTarget = path.join(directory, "stale.ts");
    const firstSource = path.join(stagingRoot, "first.ts");
    const secondSource = path.join(stagingRoot, "second.ts");
    await writeFile(firstTarget, "old-first\n");
    await writeFile(secondTarget, "old-second\n");
    await writeFile(staleTarget, "old-stale\n");
    await writeFile(firstSource, "new-first\n");
    await writeFile(secondSource, "new-second\n");

    await expect(
      publishStagedOutputs(
        [
          { source: firstSource, target: firstTarget },
          { source: secondSource, target: secondTarget },
          { source: null, target: staleTarget },
        ],
        stagingRoot,
        {
          approvedTargets: [firstTarget, secondTarget, staleTarget],
          failAt: "after-first-install",
        },
      ),
    ).rejects.toThrow();

    expect(await readFile(firstTarget, "utf8")).toBe("old-first\n");
    expect(await readFile(secondTarget, "utf8")).toBe("old-second\n");
    expect(await readFile(staleTarget, "utf8")).toBe("old-stale\n");
  });
});
