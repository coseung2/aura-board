import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";

const manifests = [
  "src/components/creatures/SlimePetPage.module.css",
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

const normalize = (value) => value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
const cascadeSource = (value) => normalize(value).replace(/\/\*[\s\S]*?\*\//gu, "");
const importsFrom = (value) => [
  ...normalize(value).matchAll(/^@import\s+"([^"]+)";\s*$/gmu),
];
const readHead = (path) =>
  normalize(execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8" }));

function rebuildHeadCascade(manifest, headManifest) {
  const headImports = importsFrom(headManifest);
  if (headImports.length === 0) return headManifest;
  return headImports
    .map((match) => readHead(posix.normalize(posix.join(posix.dirname(manifest), match[1]))))
    .join("");
}

for (const manifest of manifests) {
  const imports = importsFrom(readFileSync(manifest, "utf8"));
  if (imports.length === 0) {
    throw new Error(`${manifest}: expected local string-form @import entries`);
  }

  const rebuilt = imports
    .map((match) => normalize(readFileSync(resolve(dirname(manifest), match[1]), "utf8")))
    .join("");
  const expected = rebuildHeadCascade(manifest, readHead(manifest));
  if (cascadeSource(rebuilt) !== cascadeSource(expected)) {
    throw new Error(`${manifest}: imported shards do not preserve the HEAD cascade`);
  }
}

console.log(`CSS reconstruction/cascade parity passed for ${manifests.length} manifest(s).`);
