import { spawn } from "node:child_process";
import path from "node:path";

const [, , rawCommand, ...rawArgs] = process.argv;
if (!rawCommand) {
  console.error("Usage: node scripts/with-docker-db.mjs <command> [...args]");
  process.exit(2);
}

let command = rawCommand;
let args = rawArgs;
if (process.platform === "win32" && ["npm", "npx"].includes(rawCommand)) {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    console.error("[docker-db] npm_execpath is unavailable");
    process.exit(2);
  }
  command = process.execPath;
  args = [
    rawCommand === "npm"
      ? npmExecPath
      : path.join(path.dirname(npmExecPath), "npx-cli.js"),
    ...rawArgs,
  ];
}
const databaseUrl =
  "postgresql://aura_board:aura_board_dev@127.0.0.1:54329/aura_board?schema=public";

const child = spawn(command, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
  },
  stdio: "inherit",
  windowsHide: true,
});

child.once("error", (error) => {
  console.error(`[docker-db] Failed to start ${rawCommand}:`, error.message);
  process.exit(1);
});
child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`[docker-db] ${rawCommand} terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
