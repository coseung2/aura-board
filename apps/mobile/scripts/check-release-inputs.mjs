import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(scriptDir, "..");
const repoRoot = resolve(mobileRoot, "..", "..");

const requiredMobileFiles = [
  "plugins/with-aura-board-health-connect.js",
  "modules/aura-board-health-connect/expo-module.config.json",
  "modules/aura-board-health-connect/src/AuraBoardHealthConnectModule.ts",
  "modules/aura-board-health-connect/src/AuraBoardHealthConnect.types.ts",
  "modules/aura-board-health-connect/ios/AuraBoardHealthConnect.podspec",
  "modules/aura-board-health-connect/ios/AuraBoardHealthConnectModule.swift",
];

const errors = [];

for (const file of requiredMobileFiles) {
  if (!existsSync(join(mobileRoot, file))) {
    errors.push(`Missing release input: apps/mobile/${file}`);
  }
}

const appConfigPath = join(mobileRoot, "app.config.ts");
if (!existsSync(appConfigPath)) {
  errors.push("Missing release input: apps/mobile/app.config.ts");
} else {
  const appConfig = readFileSync(appConfigPath, "utf8");
  if (!appConfig.includes('"./plugins/with-aura-board-health-connect"')) {
    errors.push("app.config.ts must register with-aura-board-health-connect");
  }
}

const easIgnoreFiles = [
  join(repoRoot, ".easignore"),
  join(mobileRoot, ".easignore"),
];

for (const ignorePath of easIgnoreFiles) {
  if (!existsSync(ignorePath)) {
    errors.push(`Missing EAS ignore file: ${relative(repoRoot, ignorePath)}`);
    continue;
  }

  const rules = readFileSync(ignorePath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  for (const unsafeRule of ["ios/", "android/"]) {
    if (rules.includes(unsafeRule)) {
      errors.push(
        `${relative(repoRoot, ignorePath)} contains unanchored ${unsafeRule}; ` +
          "it can exclude nested Expo module native sources",
      );
    }
  }

  for (const requiredRule of ["/ios/", "/android/"]) {
    if (!rules.includes(requiredRule)) {
      errors.push(
        `${relative(repoRoot, ignorePath)} must use anchored ${requiredRule} ` +
          "for generated native directories",
      );
    }
  }
}

// EAS archives may retain a .git marker without an index. Enforce tracking in
// a real local checkout, while the remote pre-install gate verifies the files
// that actually survived archive creation.
if (existsSync(join(repoRoot, ".git", "index"))) {
  for (const file of requiredMobileFiles) {
    const repoRelativePath = `apps/mobile/${file}`;
    try {
      execFileSync(
        "git",
        ["ls-files", "--error-unmatch", "--", repoRelativePath],
        { cwd: repoRoot, stdio: "ignore" },
      );
    } catch {
      errors.push(`Release input is not tracked by git: ${repoRelativePath}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Aura Board mobile release input check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  "Aura Board mobile release inputs passed: HealthKit module sources, podspec, config plugin, and anchored EAS ignore rules are present.",
);
