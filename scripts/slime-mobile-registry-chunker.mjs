import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export function mobileRegistryChunkerPath(repoRoot) {
  return path.join(repoRoot, "apps", "mobile", "scripts", "split-generated-slime-registries.mjs");
}

export async function runMobileRegistryChunker({
  repoRoot,
  scriptPath = mobileRegistryChunkerPath(repoRoot),
  execute = execFile,
} = {}) {
  if (!repoRoot) throw new Error("repoRoot is required to run the mobile registry chunker");
  await execute(process.execPath, [scriptPath], { cwd: repoRoot });
}
