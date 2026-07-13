import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const scanRoots = ["app", "components"];
const tokenFile = join(root, "theme", "tokens.ts");

const checks = [
  { name: "hex color", pattern: /#[0-9A-Fa-f]{3,8}/ },
  { name: "rgba color", pattern: /rgba\(/ },
  { name: "legacy shadow", pattern: /\b(?:shadowColor|shadowOffset|shadowOpacity|shadowRadius|elevation):/ },
  { name: "hardcoded radius", pattern: /\bborderRadius:\s*\d/ },
  { name: "hardcoded font size", pattern: /\bfontSize:\s*\d/ },
  { name: "hardcoded line height", pattern: /\blineHeight:\s*\d/ },
  { name: "hardcoded letter spacing", pattern: /\bletterSpacing:\s*-?\d/ },
  { name: "hardcoded opacity", pattern: /\bopacity:\s*\d/ },
  { name: "hardcoded scale", pattern: /\bscale:\s*\d/ },
  { name: "hardcoded z-index", pattern: /\bzIndex:\s*\d/ },
  { name: "hardcoded border width", pattern: /\bborder[A-Za-z]*Width:\s*\d/ },
  { name: "hardcoded width", pattern: /\bwidth:\s*\d/ },
  { name: "hardcoded height", pattern: /\bheight:\s*\d/ },
  { name: "hardcoded min height", pattern: /\bminHeight:\s*\d/ },
  { name: "hardcoded max width", pattern: /\bmaxWidth:\s*\d/ },
  { name: "hardcoded gap", pattern: /\bgap:\s*\d/ },
  { name: "fixed two-column grid", pattern: /\bnumColumns=\{2\}/ },
  { name: "raw Modal", pattern: /<Modal\b/ },
  { name: "raw Pressable", pattern: /<Pressable\b/ },
  { name: "raw TextInput", pattern: /<TextInput\b/ },
  { name: "inline style literal", pattern: /style=\{\{/ },
  { name: "static window dimensions", pattern: /Dimensions\.get\(["']window["']\)/ },
  { name: "route-local header height", pattern: /navigation\.headerHeight/ },
];

const allowed = [
  {
    file: "components/ui.tsx",
    patterns: [/<Modal\b/, /<Pressable\b/, /<TextInput\b/, /navigation\.headerHeight/],
  },
  {
    file: "components/CardDetailModal.tsx",
    patterns: [/<Modal\b/],
  },
  {
    file: "components/CommentBottomSheet.tsx",
    patterns: [/<Modal\b/],
  },
  {
    file: "components/CardAuthorBottomSheet.tsx",
    patterns: [/<Modal\b/],
  },
  {
    file: "components/plant/ImageLightbox.tsx",
    patterns: [/<Modal\b/],
  },
  {
    file: "components/layouts/VibeArcadeBoard.tsx",
    patterns: [/<Modal\b/],
  },
  {
    file: "components/EmbeddedMedia.tsx",
    patterns: [
      /body, html \{ width: 100%; height: 100%;/,
      /video \{ width: 100%; height: 100%;/,
    ],
  },
];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "node_modules") continue;
      files.push(...walk(path));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

function isAllowed(file, line) {
  const normalized = file.replaceAll("\\", "/");
  return allowed.some(
    (rule) =>
      normalized.endsWith(rule.file) &&
      rule.patterns.some((pattern) => pattern.test(line)),
  );
}

const failures = [];

const tokenLines = readFileSync(tokenFile, "utf8").split(/\r?\n/);
tokenLines.forEach((line, index) => {
  if (/\bletterSpacing:/.test(line) && !/\bletterSpacing:\s*0\b/.test(line)) {
    failures.push(`theme/tokens.ts:${index + 1} nonzero token letter spacing: ${line.trim()}`);
  }
  if (/\broomCodeLetterSpacing:/.test(line) && !/\broomCodeLetterSpacing:\s*0\b/.test(line)) {
    failures.push(`theme/tokens.ts:${index + 1} nonzero room code letter spacing: ${line.trim()}`);
  }
});

const sharedUiSource = readFileSync(join(root, "components", "ui.tsx"), "utf8");
if (!/textFieldMultiline:\s*\{[\s\S]*?minHeight:\s*controls\.multilineInputMinHeight/.test(sharedUiSource)) {
  failures.push("components/ui.tsx multiline TextField must use controls.multilineInputMinHeight");
}
if (!/appHeaderBack:\s*\{[\s\S]*?backgroundColor:\s*colors\.transparent/.test(sharedUiSource)) {
  failures.push("components/ui.tsx AppHeader back control must remain flat and transparent");
}

for (const scanRoot of scanRoots) {
  const fullRoot = join(root, scanRoot);
  for (const filePath of walk(fullRoot)) {
    const rel = relative(root, filePath).replaceAll("\\", "/");
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (isAllowed(rel, line)) return;
      for (const check of checks) {
        if (check.pattern.test(line)) {
          failures.push(`${rel}:${index + 1} ${check.name}: ${line.trim()}`);
        }
      }
      if (/\bzIndex:/.test(line) && !/\bzIndex:\s*layers\./.test(line)) {
        failures.push(`${rel}:${index + 1} non-semantic z-index: ${line.trim()}`);
      }
    });
  }
}

if (failures.length > 0) {
  console.error("Mobile design-system check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Mobile design-system check passed.");
