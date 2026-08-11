import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_MAX_LINES = 720;
const DEFAULT_MAX_BYTES = 96 * 1024;
const DEFAULT_MAX_LINE_LENGTH = 200;
const COMPACT_VALUE_LENGTH = 100;

function physicalLines(value) {
  return value.split(/\r\n|\n|\r/);
}

function identifier(value) {
  return value.replace(/[^a-zA-Z0-9_$]/g, "_");
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolvedExistingParent(target) {
  let current = path.resolve(target);
  while (!(await fs.stat(current).catch(() => null))) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return fs.realpath(current);
}

async function validateOutputTarget(outputPath, approvedRoots, allowedBaseNames) {
  if (!Array.isArray(approvedRoots) || approvedRoots.length === 0) {
    throw new Error("approvedRoots must explicitly authorize generated registry output");
  }
  if (!Array.isArray(allowedBaseNames) || !allowedBaseNames.includes(path.basename(outputPath))) {
    throw new Error(`Generated registry filename is not approved: ${path.basename(outputPath)}`);
  }
  const target = path.resolve(outputPath);
  const targetParent = await resolvedExistingParent(path.dirname(target));
  const roots = await Promise.all(approvedRoots.map(async (root) => fs.realpath(path.resolve(root))));
  if (!roots.some((root) => isInside(root, target) && isInside(root, targetParent))) {
    throw new Error(`Generated registry target is outside approved roots: ${target}`);
  }
  return target;
}

function renderValue(value, depth, maxLineLength) {
  const indent = "  ".repeat(depth);
  const compact = JSON.stringify(value);
  if (compact === undefined) throw new Error("Generated registry values must be JSON serializable");
  if (indent.length + compact.length <= Math.min(COMPACT_VALUE_LENGTH, maxLineLength)) {
    return [`${indent}${compact}`];
  }
  if (value === null || typeof value !== "object") return [`${indent}${compact}`];

  if (Array.isArray(value)) {
    const lines = [`${indent}[`];
    for (const [index, item] of value.entries()) {
      const itemLines = renderValue(item, depth + 1, maxLineLength);
      if (index < value.length - 1) itemLines[itemLines.length - 1] += ",";
      lines.push(...itemLines);
    }
    lines.push(`${indent}]`);
    return lines;
  }

  const entries = Object.entries(value);
  const lines = [`${indent}{`];
  for (const [index, [key, item]] of entries.entries()) {
    const itemLines = renderValue(item, depth + 1, maxLineLength);
    const itemIndent = "  ".repeat(depth + 1);
    itemLines[0] = `${itemIndent}${JSON.stringify(key)}: ${itemLines[0].slice(itemIndent.length)}`;
    if (index < entries.length - 1) itemLines[itemLines.length - 1] += ",";
    lines.push(...itemLines);
  }
  lines.push(`${indent}}`);
  return lines;
}

function renderEntry(key, value, maxLineLength) {
  const lines = renderValue(value, 1, maxLineLength);
  lines[0] = `  ${JSON.stringify(key)}: ${lines[0].slice(2)}`;
  lines[lines.length - 1] += ",";
  return lines;
}

function contentBytes(lines) {
  return Buffer.byteLength(`${lines.join("\n")}\n`, "utf8");
}

function validateContent(fileName, content, { maxLines, maxBytes, maxLineLength }) {
  const lines = physicalLines(content);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length > maxLines) throw new Error(`${fileName} exceeds ${maxLines} lines`);
  if (Buffer.byteLength(content, "utf8") > maxBytes) throw new Error(`${fileName} exceeds ${maxBytes} bytes`);
  const longLine = lines.findIndex((line) => line.length > maxLineLength);
  if (longLine >= 0) {
    throw new Error(`${fileName}:${longLine + 1} exceeds ${maxLineLength} characters`);
  }
}

function chunkEntries(entries, limits) {
  const chunks = [];
  let current = [];
  for (const [key, value] of entries) {
    const rendered = renderEntry(key, value, limits.maxLineLength);
    const candidate = [...current, ...rendered];
    if (current.length > 0 && (candidate.length + 4 > limits.maxLines || contentBytes(candidate) > limits.maxBytes)) {
      chunks.push(current);
      current = [];
    }
    if (rendered.length + 4 > limits.maxLines || contentBytes(rendered) > limits.maxBytes) {
      throw new Error(`Registry entry ${key} exceeds the configured chunk budget`);
    }
    current.push(...rendered);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function registryFiles({ banner, registries, constants, aliases, chunkDirectoryName, limits }) {
  const files = new Map();
  const imports = [];
  const exports = [];

  for (const registry of registries) {
    const chunks = chunkEntries(registry.entries, limits);
    const names = [];
    for (const [index, entries] of chunks.entries()) {
      const number = String(index + 1).padStart(3, "0");
      const name = `${identifier(registry.name)}_${number}`;
      const fileName = `${registry.filePrefix}-${number}.generated.ts`;
      const content = [banner, "", `export const ${name} = {`, ...entries, "} as const;", ""].join("\n");
      validateContent(fileName, content, limits);
      files.set(path.join(chunkDirectoryName, fileName), content);
      imports.push(`import { ${name} } from "./${chunkDirectoryName}/${fileName.slice(0, -3)}";`);
      names.push(name);
    }
    exports.push([`export const ${registry.name} = {`, ...names.map((name) => `  ...${name},`), "} as const;"].join("\n"));
  }

  const constantCode = constants.map(({ name, value }) => {
    const lines = renderValue(value, 0, limits.maxLineLength);
    lines[0] = `export const ${name} = ${lines[0]}`;
    lines[lines.length - 1] += " as const;";
    return lines.join("\n");
  });
  const aliasCode = aliases.map(({ name, target }) => `export const ${name} = ${target};`);
  const barrel = [banner, "", ...imports, "", ...exports, ...constantCode, ...aliasCode, ""].join("\n");
  return { files, barrel };
}

async function pathExists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

export async function publishStagedOutputs(items, stagingRoot, { approvedTargets } = {}) {
  const approved = new Set((approvedTargets ?? []).map((target) => path.resolve(target)));
  if (approved.size === 0) throw new Error("approvedTargets must explicitly authorize publication");
  const resolvedStagingRoot = path.resolve(stagingRoot);
  for (const item of items) {
    if (!isInside(resolvedStagingRoot, path.resolve(item.source))) {
      throw new Error(`Staged source is outside the staging root: ${item.source}`);
    }
    if (!approved.has(path.resolve(item.target))) {
      throw new Error(`Publish target is not explicitly approved: ${item.target}`);
    }
  }

  const backupRoot = path.join(stagingRoot, "rollback");
  await fs.mkdir(backupRoot, { recursive: true });
  const movedBackups = [];
  const installed = [];
  try {
    for (const [index, item] of items.entries()) {
      await fs.mkdir(path.dirname(item.target), { recursive: true });
      if (!(await pathExists(item.target))) continue;
      const backup = path.join(backupRoot, String(index));
      await fs.rename(item.target, backup);
      movedBackups.push({ target: item.target, backup });
    }
    for (const item of items) {
      await fs.rename(item.source, item.target);
      installed.push(item.target);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const target of installed.reverse()) {
      try {
        await fs.rm(target, { recursive: true, force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    for (const item of movedBackups.reverse()) {
      try {
        await fs.rename(item.backup, item.target);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "Generated output publication and rollback failed");
    }
    throw error;
  }
  await fs.rm(backupRoot, { recursive: true, force: true });
}

export async function writeChunkedRegistry({
  outputPath,
  banner,
  registries,
  constants = [],
  aliases = [],
  approvedRoots,
  allowedBaseNames,
  maxLines = DEFAULT_MAX_LINES,
  maxBytes = DEFAULT_MAX_BYTES,
  maxLineLength = DEFAULT_MAX_LINE_LENGTH,
}) {
  const target = await validateOutputTarget(outputPath, approvedRoots, allowedBaseNames);
  const parsed = path.parse(target);
  const chunkDirectoryName = `${parsed.name}.chunks`;
  const limits = { maxLines, maxBytes, maxLineLength };
  const rendered = registryFiles({ banner, registries, constants, aliases, chunkDirectoryName, limits });
  validateContent(parsed.base, rendered.barrel, limits);

  const stagingRoot = await fs.mkdtemp(path.join(parsed.dir, `.${parsed.name}.staging-`));
  const stagedBarrel = path.join(stagingRoot, parsed.base);
  const stagedChunks = path.join(stagingRoot, chunkDirectoryName);
  try {
    await fs.mkdir(stagedChunks, { recursive: true });
    await Promise.all([...rendered.files].map(async ([relative, content]) => {
      const targetFile = path.join(stagingRoot, relative);
      await fs.mkdir(path.dirname(targetFile), { recursive: true });
      await fs.writeFile(targetFile, content, "utf8");
    }));
    await fs.writeFile(stagedBarrel, rendered.barrel, "utf8");
    await publishStagedOutputs(
      [
        { source: stagedBarrel, target },
        { source: stagedChunks, target: path.join(parsed.dir, chunkDirectoryName) },
      ],
      stagingRoot,
      { approvedTargets: [target, path.join(parsed.dir, chunkDirectoryName)] },
    );
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

async function assertSameFile(expected, actual) {
  const [expectedContent, actualContent] = await Promise.all([fs.readFile(expected, "utf8"), fs.readFile(actual, "utf8")]);
  if (expectedContent !== actualContent) throw new Error(`Generated file is stale: ${actual}`);
}

export async function verifyChunkedRegistry(options) {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "aura-registry-check-"));
  const outputPath = path.join(temporaryDirectory, path.basename(options.outputPath));
  try {
    await writeChunkedRegistry({
      ...options,
      outputPath,
      approvedRoots: [temporaryDirectory],
      allowedBaseNames: [path.basename(outputPath)],
    });
    const expectedChunkDirectory = `${outputPath.slice(0, -3)}.chunks`;
    const actualChunkDirectory = `${options.outputPath.slice(0, -3)}.chunks`;
    await assertSameFile(outputPath, options.outputPath);
    const [expectedFiles, actualFiles] = await Promise.all([fs.readdir(expectedChunkDirectory), fs.readdir(actualChunkDirectory)]);
    if (expectedFiles.join("\n") !== actualFiles.join("\n")) throw new Error(`Generated chunk set is stale: ${actualChunkDirectory}`);
    await Promise.all(expectedFiles.map((file) => assertSameFile(path.join(expectedChunkDirectory, file), path.join(actualChunkDirectory, file))));
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}
