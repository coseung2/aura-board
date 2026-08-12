import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const [basePath, localPath, databasePath, outputPath = basePath] =
  process.argv.slice(2);
if (!basePath || !localPath || !databasePath) {
  throw new Error(
    "usage: prepare-app-env.mjs <base-env> <local-play-env> <local-database-env> [output-env]",
  );
}

function parseEnv(path) {
  const entries = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    entries.set(match[1], value);
  }
  return entries;
}

const base = readFileSync(basePath, "utf8")
  .split(/\r?\n/)
  .filter((line) => !/^VERCEL(?:_[A-Za-z0-9_]+)?=/.test(line))
  .join("\n")
  .trimEnd();
const local = parseEnv(localPath);
const database = parseEnv(databasePath);
const requiredLocal = (key) => {
  const value = local.get(key)?.trim();
  if (!value) throw new Error(`${key} is missing from the local source env`);
  return value;
};
const requiredDatabase = (key) => {
  const value = database.get(key)?.trim();
  if (!value) throw new Error(`${key} is missing from the database source env`);
  return value;
};
const requiredRuntime = (key, fallback) => {
  const value = process.env[key]?.trim() || fallback;
  if (!value) throw new Error(`${key} is missing from the injected runtime`);
  return value;
};

const overrides = {
  DATABASE_URL: requiredDatabase("DATABASE_URL"),
  DIRECT_URL: requiredDatabase("DIRECT_URL"),
  CRON_SECRET:
    process.env.CRON_SECRET?.trim() || randomBytes(48).toString("base64url"),
  AURA_BOARD_BASE_URL: requiredRuntime(
    "AURA_BOARD_BASE_URL",
    "https://aura-board.com",
  ),
  NEXT_PUBLIC_APP_BASE_URL: requiredRuntime(
    "NEXT_PUBLIC_APP_BASE_URL",
    "https://aura-board.com",
  ),
  AUTH_URL: "https://aura-board.com",
  NEXTAUTH_URL: "https://aura-board.com",
  PARENT_OAUTH_REDIRECT_BASE_URL: "https://aura-board.com",
  AUTH_TRUST_HOST: "true",
  PLAY_ENGINE_URL: "http://127.0.0.1:8081",
  PLAY_ENGINE_BIND: "127.0.0.1:8081",
  PLAY_ENGINE_ASSERTION_SECRET: requiredLocal("PLAY_ENGINE_ASSERTION_SECRET"),
  PLAY_ENGINE_INTERNAL_SECRET: requiredLocal("PLAY_ENGINE_INTERNAL_SECRET"),
};

const rendered = Object.entries(overrides)
  .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
  .join("\n");
writeFileSync(outputPath, `${base}\n${rendered}\n`, {
  encoding: "utf8",
  mode: 0o600,
});

console.log(`Prepared ${Object.keys(overrides).length} runtime overrides.`);
