import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
]);
const ignoredDirectories = new Set([
  "node_modules",
  ".expo",
  "android",
  "ios",
  "dist",
  "coverage",
  "assets",
]);
const maxReadableLineLength = 300;
const failures = [];
let checked = 0;

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(entryPath);
      continue;
    }
    if (!sourceExtensions.has(path.extname(entry.name))) continue;
    checked += 1;
    const source = fs.readFileSync(entryPath, "utf8");
    const lines = source.split(/\r?\n/);
    const lineCount = lines.length;
    if (lineCount > 800)
      failures.push(
        `${path.relative(mobileRoot, entryPath)}: ${lineCount} lines`,
      );
    const longestLine = Math.max(0, ...lines.map((line) => line.length));
    if (longestLine > maxReadableLineLength) {
      failures.push(
        `${path.relative(mobileRoot, entryPath)}: max line ${longestLine} characters`,
      );
    }
    if (![".ts", ".tsx", ".js", ".jsx"].includes(path.extname(entry.name)))
      continue;
    const kind = entry.name.endsWith("x")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      entryPath,
      source,
      ts.ScriptTarget.Latest,
      true,
      kind,
    );
    for (const diagnostic of sourceFile.parseDiagnostics) {
      const location = sourceFile.getLineAndCharacterOfPosition(
        diagnostic.start ?? 0,
      );
      failures.push(
        `${path.relative(mobileRoot, entryPath)}:${location.line + 1}:${location.character + 1} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
      );
    }
  }
}

visit(mobileRoot);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Mobile source line/syntax check passed (${checked} files).`);
}
