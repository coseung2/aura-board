import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const textExtensions = new Set([
  ".css",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".scss",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const sourceRoots = /^(?:(?:docs|prisma|scripts|src)\/|package\.json$)/;
const excludedPaths = /^(?:apps\/mobile|src\/lib\/pets\/.*\.generated\.chunks)\//;
const mojibakePatterns = [
  { label: "Unicode replacement character", pattern: /\uFFFD/u },
  {
    label: "UTF-8 decoded as Windows-1252",
    pattern: /(?:\u00C3.|\u00C2.|\u00E2\u20AC|\u00EF\u00BB\u00BF)/u,
  },
  { label: "question-mark-prefixed Hangul mojibake", pattern: /\?[가-힣]{2,}/u },
];
const fix = process.argv.includes("--fix");

function gitLines(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split(/\r?\n/u)
    .filter(Boolean);
}

const changed = new Set([
  ...gitLines(["diff", "--name-only", "--diff-filter=ACMR"]),
  ...gitLines(["ls-files", "--others", "--exclude-standard"]),
]);
const decoder = new TextDecoder("utf-8", { fatal: true });
const failures = [];
let checked = 0;

for (const file of [...changed].sort()) {
  const extension = file.slice(file.lastIndexOf("."));
  if (!sourceRoots.test(file) || excludedPaths.test(file) || !textExtensions.has(extension)) {
    continue;
  }

  let bytes = readFileSync(file);
  checked += 1;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    if (fix) bytes = bytes.subarray(3);
    else failures.push(`${file}: UTF-8 BOM`);
  }

  let text;
  try {
    text = decoder.decode(bytes);
  } catch {
    failures.push(`${file}: invalid UTF-8`);
    continue;
  }

  if (fix) {
    const normalized = text.replace(/\r\n?/gu, "\n");
    if (normalized !== text || bytes.length !== readFileSync(file).length) {
      writeFileSync(file, normalized, "utf8");
      text = normalized;
    }
  }

  for (const { label, pattern } of mojibakePatterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const line = text.slice(0, match.index).split("\n").length;
    failures.push(`${file}:${line}: ${label}`);
  }
}

if (failures.length > 0) {
  console.error(`Encoding probe failed (${failures.length} finding(s)):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Encoding probe passed for ${checked} changed non-mobile text file(s)${fix ? " after normalization" : ""}.`,
);
