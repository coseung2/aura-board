import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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

for (const manifest of manifests) {
  const imports = [...readFileSync(manifest, "utf8").matchAll(/^@import\s+"([^"]+)";\s*$/gmu)];
  if (imports.length === 0) {
    throw new Error(`${manifest}: expected local string-form @import entries`);
  }

  const rebuilt = imports
    .map((match) => normalize(readFileSync(resolve(dirname(manifest), match[1]), "utf8")))
    .join("");
  const head = normalize(execFileSync("git", ["show", `HEAD:${manifest}`], { encoding: "utf8" }));
  if (cascadeSource(rebuilt) !== cascadeSource(head)) {
    throw new Error(`${manifest}: imported shards do not preserve the HEAD cascade`);
  }
}

console.log(`CSS reconstruction/cascade parity passed for ${manifests.length} manifest(s).`);
