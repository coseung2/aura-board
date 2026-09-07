import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postcss from "postcss";

const manifests = [
  "src/components/creatures/SlimePetPage.styles.ts",
  "src/components/live-quiz/live-quiz.module.css",
  "src/features/kordle/components/kordle.css",
  "src/styles/admin.css",
  "src/styles/agent.css",
  "src/styles/assessment.css",
  "src/styles/assignment.css",
  "src/styles/auth.css",
  "src/styles/boards-dj.css",
  "src/styles/boards-stream-settings.css",
  "src/styles/card.css",
  "src/styles/classroom.css",
  "src/styles/home.css",
  "src/styles/misc.css",
  "src/styles/modal.css",
  "src/styles/plant.css",
  "src/styles/quiz.css",
  "src/styles/shadow-alliance.css",
  "src/styles/side-panel.css",
  "src/styles/student.css",
  "src/styles/vibe-arcade.css",
];

function localImport(owner, target) {
  if (!target.startsWith(".")) {
    throw new Error(`${owner}: only relative local CSS imports can be reconstructed`);
  }
  const file = posix.normalize(posix.join(posix.dirname(owner), target));
  if (file.startsWith("../")) throw new Error(`${owner}: import escapes repository`);
  return file;
}

// Ignore comments and formatting only; preserve every selector, declaration,
// value, !important flag, at-rule, and their ordering (including duplicates).
function signature(node) {
  if (node.type === "comment") return [];
  const result = { type: node.type };
  for (const field of ["selector", "name", "params", "prop", "value", "important"]) {
    if (node[field] !== undefined) result[field] = node[field];
  }
  if (node.nodes) result.nodes = node.nodes.flatMap(signature);
  return [result];
}

/** Reconstruct both CSS @imports and the pet screen's CSS-module import map. */
export function rebuildCascade(file, readSource, ancestors = []) {
  if (ancestors.includes(file)) throw new Error(`CSS import cycle: ${[...ancestors, file].join(" -> ")}`);
  const source = readSource(file).replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const stack = [...ancestors, file];
  if (file.endsWith(".ts")) {
    const imports = [...source.matchAll(/^import\s+\w+\s+from\s+["']([^"']+\.css)["'];?\s*$/gmu)];
    if (!imports.length) throw new Error(`${file}: no CSS-module imports found`);
    return imports.flatMap((match) => rebuildCascade(localImport(file, match[1]), readSource, stack));
  }
  const root = postcss.parse(source, { from: file });
  return root.nodes.flatMap((node) => {
    if (node.type !== "atrule" || node.name !== "import") return signature(node);
    // External imports are compared verbatim; never fetch remote styles.
    if (/^(?:url\(\s*)?["']?https?:\/\//u.test(node.params)) return signature(node);
    const match = node.params.match(/^["']([^"']+)["']$/u);
    if (!match) throw new Error(`${file}: unsupported conditional local @import`);
    return rebuildCascade(localImport(file, match[1]), readSource, stack);
  });
}

export function checkCssShardParity(baseRef = "HEAD") {
  const readBase = (file) => execFileSync("git", ["show", `${baseRef}:${file}`], { encoding: "utf8" });
  for (const manifest of manifests) {
    const actual = rebuildCascade(manifest, (file) => readFileSync(resolve(file), "utf8"));
    const expected = rebuildCascade(manifest, readBase);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${manifest}: shards do not preserve the ${baseRef} cascade`);
    }
  }
  console.log(`CSS reconstruction/cascade parity passed for ${manifests.length} manifest(s) against ${baseRef}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkCssShardParity(process.env.CSS_PARITY_BASE_REF || "HEAD");
}
