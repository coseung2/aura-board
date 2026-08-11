import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import * as prettier from "prettier";
import ts from "typescript";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const canonicalLibRoot = path.join(mobileRoot, "lib");
const marker = "// Generated mobile-local split";
const chunkLineBudget = 720;
const chunkByteBudget = 80_000;
const barrelInlineLineBudget = 120;
const maxLineLength = 240;
const targets = [
  "slime-assets.generated.ts",
  "slime-wearables.generated.ts",
  "slime-wearable-actions.generated.ts",
];
const prettierConfig = (await prettier.resolveConfig(mobileRoot)) ?? {};

function physicalLines(source) {
  return source.split(/\r?\n/);
}

function sourceMetrics(source) {
  const lines = physicalLines(source);
  return {
    lines: lines.length,
    bytes: Buffer.byteLength(source),
    longestLine: Math.max(0, ...lines.map((line) => line.length)),
  };
}

function assertBudget(filename, source) {
  const metrics = sourceMetrics(source);
  if (
    metrics.lines > 800 ||
    metrics.bytes > chunkByteBudget ||
    metrics.longestLine > maxLineLength
  ) {
    throw new Error(
      `${filename} exceeds generated readability budget: ${metrics.lines} lines, ${metrics.bytes} bytes, max line ${metrics.longestLine}`,
    );
  }
}

async function formatTypeScript(source, filepath) {
  return prettier.format(source, {
    ...prettierConfig,
    filepath,
    parser: "typescript",
  });
}

function exportedConstants(sourceFile) {
  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isVariableStatement(statement)) return [];
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!exported) return [];
    return statement.declarationList.declarations.map((declaration) => {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        throw new Error("Unsupported generated export declaration.");
      }
      return {
        name: declaration.name.text,
        initializer: declaration.initializer,
      };
    });
  });
}

function unwrapConstAssertion(initializer) {
  if (
    ts.isAsExpression(initializer) &&
    (initializer.type.kind === ts.SyntaxKind.ConstKeyword ||
      initializer.type.getText() === "const")
  ) {
    return { expression: initializer.expression, constAssertion: true };
  }
  return { expression: initializer, constAssertion: false };
}

function replaceNodeText(container, containerNode, childNode, replacement) {
  const start = childNode.getStart() - containerNode.getStart();
  const end = childNode.end - containerNode.getStart();
  return `${container.slice(0, start)}${replacement}${container.slice(end)}`;
}

function stableValueHash(value) {
  const stableExports = Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((name) => [name, value[name]]),
  );
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableExports))
    .digest("hex");
}

function evaluateMonolith(source, filename) {
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  const assetRequire = (request) =>
    `asset:${String(request).replaceAll("\\", "/")}`;
  Function(
    "require",
    "module",
    "exports",
    output,
  )(assetRequire, module, module.exports);
  return module.exports;
}

async function evaluateSplit(entryPath, libRoot) {
  const result = await build({
    absWorkingDir: libRoot,
    entryPoints: [path.basename(entryPath)],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    external: ["*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp"],
    logLevel: "silent",
  });
  const module = { exports: {} };
  const assetRequire = (request) =>
    `asset:${String(request).replaceAll("\\", "/")}`;
  Function(
    "require",
    "module",
    "exports",
    result.outputFiles[0].text,
  )(assetRequire, module, module.exports);
  return module.exports;
}

function exportSummary(exportsObject) {
  return Object.fromEntries(
    Object.entries(exportsObject).map(([name, value]) => [
      name,
      Array.isArray(value)
        ? value.length
        : value && typeof value === "object"
          ? Object.keys(value).length
          : 1,
    ]),
  );
}

function parseAndAssert(filename, source) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    throw new Error(
      `${filename} has generated syntax errors: ${sourceFile.parseDiagnostics
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
        )
        .join("; ")}`,
    );
  }
  assertBudget(filename, source);
}

function splitMetadata(source) {
  const hash = source.match(
    /^\/\/ Source value SHA-256: ([a-f0-9]{64})$/m,
  )?.[1];
  const exportsLine = source.match(/^\/\/ Stable exports: (.+)$/m)?.[1];
  if (!hash || !exportsLine) {
    throw new Error("Split generated barrel is missing validation metadata.");
  }
  return { hash, exports: exportsLine.split(",") };
}

function matchingChunkFiles(libRoot, baseName) {
  if (!fs.existsSync(libRoot)) return [];
  return fs
    .readdirSync(libRoot)
    .filter(
      (filename) =>
        filename.startsWith(`${baseName}.`) &&
        filename.includes(".chunk-") &&
        filename.endsWith(".ts"),
    )
    .sort();
}

function importedChunkFiles(source) {
  return new Set(
    [...source.matchAll(/from "\.\/(.+\.chunk-\d+)";/g)].map(
      (match) => `${match[1]}.ts`,
    ),
  );
}

function reachableChunkFiles(libRoot, source) {
  const reachable = new Set();
  const pending = [...importedChunkFiles(source)];
  while (pending.length > 0) {
    const chunk = pending.pop();
    if (reachable.has(chunk)) continue;
    const chunkPath = path.join(libRoot, chunk);
    if (!fs.existsSync(chunkPath)) {
      throw new Error(`Generated split references missing ${chunk}`);
    }
    reachable.add(chunk);
    const chunkSource = fs.readFileSync(chunkPath, "utf8");
    for (const dependency of importedChunkFiles(chunkSource)) {
      if (!reachable.has(dependency)) pending.push(dependency);
    }
  }
  return reachable;
}

async function validateExistingSplit(libRoot, filename, source) {
  const baseName = filename.slice(0, -3);
  const referenced = reachableChunkFiles(libRoot, source);
  for (const stale of matchingChunkFiles(libRoot, baseName).filter(
    (chunk) => !referenced.has(chunk),
  )) {
    fs.rmSync(path.join(libRoot, stale));
  }
  parseAndAssert(filename, source);
  for (const chunk of referenced) {
    parseAndAssert(chunk, fs.readFileSync(path.join(libRoot, chunk), "utf8"));
  }
  const metadata = splitMetadata(source);
  const value = await evaluateSplit(path.join(libRoot, filename), libRoot);
  const hash = stableValueHash(value);
  if (hash !== metadata.hash) {
    throw new Error(
      `${filename} split value hash is stale: expected ${metadata.hash}, received ${hash}`,
    );
  }
  const actualExports = Object.keys(value).sort();
  if (actualExports.join(",") !== [...metadata.exports].sort().join(",")) {
    throw new Error(`${filename} stable exports changed.`);
  }
  return exportSummary(value);
}

async function splitTarget(libRoot, filename, monolith) {
  const sourceFile = ts.createSourceFile(
    filename,
    monolith,
    ts.ScriptTarget.Latest,
    true,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    throw new Error(`${filename} monolith has syntax errors.`);
  }
  const originalValue = evaluateMonolith(monolith, filename);
  const expectedHash = stableValueHash(originalValue);
  const stableExports = Object.keys(originalValue);
  const baseName = filename.slice(0, -3);
  let chunkIndex = 0;
  const emitted = [];

  function nextChunkIdentity() {
    const suffix = String(chunkIndex++).padStart(3, "0");
    return {
      exportName: `SLIME_GENERATED_CHUNK_${suffix}`,
      filename: `${baseName}.value.chunk-${suffix}.ts`,
      moduleName: `./${baseName}.value.chunk-${suffix}`,
    };
  }

  async function expressionFits(text, imports, lineBudget) {
    const formatted = await formatTypeScript(
      [...imports, `const GENERATED_VALUE = ${text} as const;`, ""].join("\n"),
      path.join(libRoot, `${baseName}.probe.ts`),
    );
    const metrics = sourceMetrics(formatted);
    return (
      metrics.lines <= lineBudget &&
      metrics.bytes <= chunkByteBudget &&
      metrics.longestLine <= maxLineLength
    );
  }

  async function emitValue(kind, pieces, pathParts) {
    const groups = [];
    let current = [];
    for (const piece of pieces) {
      const candidate = [...current, piece];
      const candidateText =
        kind === "object"
          ? `{\n${candidate.map((item) => item.text).join(",\n")}\n}`
          : `[\n${candidate.map((item) => item.text).join(",\n")}\n]`;
      const candidateImports = new Set(
        candidate.flatMap((item) => [...item.imports]),
      );
      if (
        current.length > 0 &&
        !(await expressionFits(
          candidateText,
          candidateImports,
          chunkLineBudget,
        ))
      ) {
        groups.push(current);
        current = [piece];
      } else {
        current = candidate;
      }
    }
    if (current.length > 0) groups.push(current);

    const groupReferences = [];
    for (const group of groups) {
      const identity = nextChunkIdentity();
      const imports = new Set(group.flatMap((item) => [...item.imports]));
      const valueText =
        kind === "object"
          ? `{\n${group.map((item) => item.text).join(",\n")}\n}`
          : `[\n${group.map((item) => item.text).join(",\n")}\n]`;
      const moduleSource = await formatTypeScript(
        [
          `// Deterministic ${pathParts.join("/")} generated value chunk.`,
          ...imports,
          "",
          `export const ${identity.exportName} = ${valueText} as const;`,
          "",
        ].join("\n"),
        path.join(libRoot, identity.filename),
      );
      parseAndAssert(identity.filename, moduleSource);
      emitted.push({ ...identity, source: moduleSource });
      groupReferences.push(identity);
    }

    if (groupReferences.length === 1) {
      const only = groupReferences[0];
      return {
        text: only.exportName,
        imports: new Set([
          `import { ${only.exportName} } from "${only.moduleName}";`,
        ]),
      };
    }
    const root = nextChunkIdentity();
    const rootValue =
      kind === "object"
        ? `{\n${groupReferences.map((group) => `...${group.exportName}`).join(",\n")}\n}`
        : `[\n${groupReferences.map((group) => `...${group.exportName}`).join(",\n")}\n]`;
    const rootSource = await formatTypeScript(
      [
        `// Deterministic ${pathParts.join("/")} generated root.`,
        ...groupReferences.map(
          (group) =>
            `import { ${group.exportName} } from "${group.moduleName}";`,
        ),
        "",
        `export const ${root.exportName} = ${rootValue} as const;`,
        "",
      ].join("\n"),
      path.join(libRoot, root.filename),
    );
    parseAndAssert(root.filename, rootSource);
    emitted.push({ ...root, source: rootSource });
    return {
      text: root.exportName,
      imports: new Set([
        `import { ${root.exportName} } from "${root.moduleName}";`,
      ]),
    };
  }

  async function prepareExpression(
    node,
    pathParts,
    lineBudget = chunkLineBudget,
  ) {
    if (ts.isObjectLiteralExpression(node)) {
      const pieces = [];
      for (let index = 0; index < node.properties.length; index += 1) {
        const property = node.properties[index];
        let text = property.getText(sourceFile);
        const imports = new Set();
        if (
          ts.isPropertyAssignment(property) &&
          (ts.isObjectLiteralExpression(property.initializer) ||
            ts.isArrayLiteralExpression(property.initializer))
        ) {
          const child = await prepareExpression(property.initializer, [
            ...pathParts,
            `property-${index}`,
          ]);
          text = replaceNodeText(
            text,
            property,
            property.initializer,
            child.text,
          );
          child.imports.forEach((item) => imports.add(item));
        }
        pieces.push({ text, imports });
      }
      const inlineText = `{\n${pieces.map((piece) => piece.text).join(",\n")}\n}`;
      const imports = new Set(pieces.flatMap((piece) => [...piece.imports]));
      if (await expressionFits(inlineText, imports, lineBudget)) {
        return { text: inlineText, imports };
      }
      return emitValue("object", pieces, pathParts);
    }
    if (ts.isArrayLiteralExpression(node)) {
      const pieces = [];
      for (let index = 0; index < node.elements.length; index += 1) {
        const element = node.elements[index];
        const prepared =
          ts.isObjectLiteralExpression(element) ||
          ts.isArrayLiteralExpression(element)
            ? await prepareExpression(element, [
                ...pathParts,
                `element-${index}`,
              ])
            : { text: element.getText(sourceFile), imports: new Set() };
        pieces.push(prepared);
      }
      const inlineText = `[\n${pieces.map((piece) => piece.text).join(",\n")}\n]`;
      const imports = new Set(pieces.flatMap((piece) => [...piece.imports]));
      if (await expressionFits(inlineText, imports, lineBudget)) {
        return { text: inlineText, imports };
      }
      return emitValue("array", pieces, pathParts);
    }
    return { text: node.getText(sourceFile), imports: new Set() };
  }

  const barrelImports = new Set();
  const barrelDeclarations = [];
  for (const exported of exportedConstants(sourceFile)) {
    const { expression, constAssertion } = unwrapConstAssertion(
      exported.initializer,
    );
    const prepared = await prepareExpression(
      expression,
      [exported.name],
      barrelInlineLineBudget,
    );
    prepared.imports.forEach((item) => barrelImports.add(item));
    const canAssertConst =
      prepared.text.trimStart().startsWith("{") ||
      prepared.text.trimStart().startsWith("[");
    barrelDeclarations.push(
      `export const ${exported.name} = ${prepared.text}${constAssertion && canAssertConst ? " as const" : ""};`,
    );
  }
  const barrelSource = await formatTypeScript(
    [
      `${marker} for ${filename}.`,
      `// Source value SHA-256: ${expectedHash}`,
      `// Stable exports: ${stableExports.join(",")}`,
      "// Regenerate the monolith first, then run scripts/split-generated-slime-registries.mjs.",
      "",
      ...barrelImports,
      "",
      ...barrelDeclarations,
      "",
    ].join("\n"),
    path.join(libRoot, filename),
  );
  parseAndAssert(filename, barrelSource);

  for (const chunk of emitted) {
    fs.writeFileSync(path.join(libRoot, chunk.filename), chunk.source);
  }
  fs.writeFileSync(path.join(libRoot, filename), barrelSource);

  const splitValue = await evaluateSplit(path.join(libRoot, filename), libRoot);
  const actualHash = stableValueHash(splitValue);
  if (actualHash !== expectedHash) {
    throw new Error(
      `${filename} value parity failed: expected ${expectedHash}, received ${actualHash}`,
    );
  }
  const actualExports = Object.keys(splitValue).sort();
  if (actualExports.join(",") !== [...stableExports].sort().join(",")) {
    throw new Error(`${filename} export parity failed.`);
  }
  return exportSummary(splitValue);
}

function removeStagedTarget(stagingLibRoot, filename) {
  const baseName = filename.slice(0, -3);
  fs.rmSync(path.join(stagingLibRoot, filename), { force: true });
  for (const chunk of matchingChunkFiles(stagingLibRoot, baseName)) {
    fs.rmSync(path.join(stagingLibRoot, chunk), { force: true });
  }
}

export async function stageMobileGeneratedRegistry({
  filename,
  sourcePath,
  stagingLibRoot,
}) {
  if (!targets.includes(filename)) {
    throw new Error(`Unsupported mobile generated registry: ${filename}`);
  }
  const source = fs.readFileSync(sourcePath, "utf8");
  const sourceRoot = path.dirname(sourcePath);
  const existingChunks = source.startsWith(marker)
    ? [...reachableChunkFiles(sourceRoot, source)].map((chunk) => [
        chunk,
        fs.readFileSync(path.join(sourceRoot, chunk), "utf8"),
      ])
    : [];

  fs.mkdirSync(stagingLibRoot, { recursive: true });
  removeStagedTarget(stagingLibRoot, filename);
  let summary;
  if (source.startsWith(marker)) {
    fs.writeFileSync(path.join(stagingLibRoot, filename), source, "utf8");
    for (const [chunk, chunkSource] of existingChunks) {
      fs.writeFileSync(path.join(stagingLibRoot, chunk), chunkSource, "utf8");
    }
    summary = await validateExistingSplit(stagingLibRoot, filename, source);
  } else {
    summary = await splitTarget(stagingLibRoot, filename, source);
  }

  const barrel = fs.readFileSync(path.join(stagingLibRoot, filename), "utf8");
  const reachable = [...reachableChunkFiles(stagingLibRoot, barrel)].sort();
  const emitted = matchingChunkFiles(stagingLibRoot, filename.slice(0, -3));
  if (reachable.join("\n") !== emitted.join("\n")) {
    throw new Error(
      `${filename} staged chunk inventory contains unreachable files.`,
    );
  }
  return { filename, files: [...reachable, filename], summary };
}

export function mobileRegistryPublicationItems({
  filename,
  stagingLibRoot,
  targetLibRoot,
}) {
  const baseName = filename.slice(0, -3);
  const stagedChunks = matchingChunkFiles(stagingLibRoot, baseName);
  const stagedNames = new Set(stagedChunks);
  const items = [
    ...stagedChunks.map((chunk) => ({
      source: path.join(stagingLibRoot, chunk),
      target: path.join(targetLibRoot, chunk),
    })),
    {
      source: path.join(stagingLibRoot, filename),
      target: path.join(targetLibRoot, filename),
    },
  ];
  for (const stale of matchingChunkFiles(targetLibRoot, baseName)) {
    if (!stagedNames.has(stale)) {
      items.push({ source: null, target: path.join(targetLibRoot, stale) });
    }
  }
  return items;
}

export function verifyMobileRegistryStage({
  filename,
  stagingLibRoot,
  targetLibRoot,
}) {
  const baseName = filename.slice(0, -3);
  const expected = [
    ...matchingChunkFiles(stagingLibRoot, baseName),
    filename,
  ].sort();
  const actual = [
    ...matchingChunkFiles(targetLibRoot, baseName),
    filename,
  ].sort();
  if (expected.join("\n") !== actual.join("\n")) {
    throw new Error(`${filename} canonical chunk inventory is stale.`);
  }
  for (const relative of expected) {
    const staged = fs.readFileSync(path.join(stagingLibRoot, relative));
    const canonical = fs.readFileSync(path.join(targetLibRoot, relative));
    if (!staged.equals(canonical)) {
      throw new Error(
        `${filename} canonical generated output is stale: ${relative}`,
      );
    }
  }
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function pathExists(filePath) {
  return fs.existsSync(filePath);
}

export function publishStagedFileSet(
  items,
  stagingRoot,
  { approvedTargets, failAt = null } = {},
) {
  const resolvedStagingRoot = path.resolve(stagingRoot);
  const approved = new Set(
    (approvedTargets ?? []).map((target) => path.resolve(target)),
  );
  if (approved.size === 0) {
    throw new Error("approvedTargets must explicitly authorize publication");
  }
  const seenTargets = new Set();
  for (const item of items) {
    const target = path.resolve(item.target);
    if (seenTargets.has(target))
      throw new Error(`Duplicate publish target: ${target}`);
    seenTargets.add(target);
    if (!approved.has(target)) {
      throw new Error(`Publish target is not explicitly approved: ${target}`);
    }
    if (item.source) {
      const source = path.resolve(item.source);
      if (!isInside(resolvedStagingRoot, source)) {
        throw new Error(`Staged source is outside the staging root: ${source}`);
      }
      if (!pathExists(source))
        throw new Error(`Missing staged source: ${source}`);
    }
  }
  if (failAt === "before-publish") {
    throw new Error("Forced failure before publication");
  }

  const backupRoot = path.join(resolvedStagingRoot, ".rollback");
  fs.mkdirSync(backupRoot, { recursive: true });
  const backups = [];
  const installed = [];
  try {
    for (const [index, item] of items.entries()) {
      if (!pathExists(item.target)) continue;
      const backup = path.join(backupRoot, String(index));
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.renameSync(item.target, backup);
      backups.push({ backup, target: item.target });
    }
    if (failAt === "after-backup") {
      throw new Error("Forced failure after canonical backup");
    }
    for (const item of items) {
      if (!item.source) continue;
      fs.mkdirSync(path.dirname(item.target), { recursive: true });
      fs.renameSync(item.source, item.target);
      installed.push(item.target);
      if (failAt === "after-first-install" && installed.length === 1) {
        throw new Error("Forced failure after first staged install");
      }
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const target of installed.reverse()) {
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const item of backups.reverse()) {
      try {
        fs.mkdirSync(path.dirname(item.target), { recursive: true });
        fs.renameSync(item.backup, item.target);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Generated output publication and rollback failed",
      );
    }
    fs.rmSync(backupRoot, { recursive: true, force: true });
    throw error;
  }
  fs.rmSync(backupRoot, { recursive: true, force: true });
}

export async function splitGeneratedSlimeRegistries({
  libRoot = canonicalLibRoot,
  filenames = targets,
  failAt = null,
} = {}) {
  const resolvedLibRoot = path.resolve(libRoot);
  const stagingRoot = fs.mkdtempSync(
    path.join(path.dirname(resolvedLibRoot), ".slime-registry-staging-"),
  );
  const stagingLibRoot = path.join(stagingRoot, "lib");
  try {
    const results = [];
    for (const filename of filenames) {
      results.push(
        await stageMobileGeneratedRegistry({
          filename,
          sourcePath: path.join(resolvedLibRoot, filename),
          stagingLibRoot,
        }),
      );
    }
    if (failAt === "after-validation") {
      throw new Error(
        "Forced failure after staged rendering and parity validation",
      );
    }
    const items = filenames.flatMap((filename) =>
      mobileRegistryPublicationItems({
        filename,
        stagingLibRoot,
        targetLibRoot: resolvedLibRoot,
      }),
    );
    publishStagedFileSet(items, stagingRoot, {
      approvedTargets: items.map((item) => item.target),
      failAt,
    });
    return Object.fromEntries(
      results.map((result) => [result.filename, result.summary]),
    );
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const summaries = await splitGeneratedSlimeRegistries({
    failAt: process.env.SLIME_REGISTRY_FAIL_AT ?? null,
  });
  for (const [filename, summary] of Object.entries(summaries)) {
    console.log(
      `${filename}: AST/budget/export/key/value parity OK ${JSON.stringify(summary)}`,
    );
  }
}
