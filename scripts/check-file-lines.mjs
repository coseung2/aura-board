import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const MAX_LINES = 800;
const SOURCE_ROOTS = ["src", "apps", "scripts", "prisma", "play-engine"];
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".scss",
  ".swift",
  ".ts",
  ".tsx",
]);
const EXCLUDED_DIRECTORIES = new Set([
  ".expo",
  ".git",
  ".next",
  "assets",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

function collectSourceFiles(directory, output) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) collectSourceFiles(path, output);
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) output.push(path);
  }
}

function physicalLineCount(path) {
  const content = readFileSync(path, "utf8");
  if (content.length === 0) return 0;
  const lines = content.split(/\r\n|\n|\r/).length;
  return /(?:\r\n|\n|\r)$/.test(content) ? lines - 1 : lines;
}

const files = [];
for (const root of SOURCE_ROOTS) {
  if (existsSync(root)) collectSourceFiles(root, files);
}

const violations = files
  .map((path) => ({ path, lines: physicalLineCount(path) }))
  .filter(({ lines }) => lines > MAX_LINES)
  .sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path));

if (violations.length > 0) {
  console.error(`Source files must not exceed ${MAX_LINES} physical lines:`);
  for (const { path, lines } of violations) {
    console.error(`${lines}\t${relative(process.cwd(), path)}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Line limit passed: ${files.length} source files are at most ${MAX_LINES} lines.`);
}
