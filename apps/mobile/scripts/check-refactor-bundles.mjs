import path from "node:path";
import { build } from "esbuild";

const mobileRoot = path.resolve(import.meta.dirname, "..");
await build({
  absWorkingDir: mobileRoot,
  entryPoints: [
    "app/index.tsx",
    "app/(student)/index.tsx",
    "app/(student)/walking.tsx",
    "app/(student)/reading.tsx",
    "app/(student)/slime.tsx",
  ],
  bundle: true,
  write: false,
  outdir: "refactor-check-output",
  platform: "neutral",
  packages: "external",
  external: ["*.png", "*.jpg", "*.jpeg", "*.gif", "*.webp"],
  logLevel: "warning",
});
console.log("Mobile refactor bundle check passed (5 entry points).");
