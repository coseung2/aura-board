#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const INFISICAL_PROJECT_ID = "b850cd45-d5d6-4211-b33e-7641f45f3d48";
const INFISICAL_ENV = process.env.SUPABASE_DR_INFISICAL_ENV?.trim() || "prod";
const INFISICAL_PATH = "/";
const TOKEN_NAME = "SUPABASE_ACCESS_TOKEN_DR";
const READY_FLAG = "AURA_SUPABASE_DR_TOKEN_READY";
const SUPABASE_DR_PROJECT_NAME = "aura-board-dr";
const SUPABASE_DR_PROJECT_REF = "ivfwgyapgnpwwzllpync";
const scriptPath = fileURLToPath(import.meta.url);

function fail(message) {
  console.error(`[supabase-dr] ${message}`);
  process.exit(1);
}

function run(command, args, env, options = {}) {
  const result = spawnSync(command, args, {
    env,
    stdio: "inherit",
    shell: options.shell ?? process.platform === "win32",
  });
  if (result.error) fail(result.error.message);
  if (typeof result.status === "number") process.exit(result.status);
  process.exit(1);
}

if (process.env[READY_FLAG] !== "1") {
  const infisicalCommand = process.platform === "win32" ? "infisical.exe" : "infisical";
  run(
    infisicalCommand,
    [
      "run",
      `--projectId=${INFISICAL_PROJECT_ID}`,
      `--env=${INFISICAL_ENV}`,
      `--path=${INFISICAL_PATH}`,
      "--",
      process.execPath,
      scriptPath,
      ...process.argv.slice(2),
    ],
    { ...process.env, [READY_FLAG]: "1" },
    { shell: false },
  );
}

const token = process.env[TOKEN_NAME]?.trim();
if (!token) {
  fail(
    `${TOKEN_NAME} was not injected. ` +
      `Add the read-only token to Infisical ${INFISICAL_ENV}:${INFISICAL_PATH}.`,
  );
}

const env = {
  ...process.env,
  SUPABASE_ACCESS_TOKEN: token,
  SUPABASE_DR_PROJECT_NAME,
  SUPABASE_DR_PROJECT_REF,
};
delete env[TOKEN_NAME];

run("supabase", process.argv.slice(2), env);
