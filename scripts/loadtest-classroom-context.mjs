
import { PrismaClient } from "@prisma/client";
import { encode } from "@auth/core/jwt";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import {
  estimateRealtimeWave,
  estimateRealtimeJoinSchedule,
  evaluateRealtimeApproval,
  evaluateRealtimeAllocation,
  exactSyntheticOutboxSources,
  expectedRealtimeMessageCounts,
  parseRequestValidation,
  recordRealtimeCallback as updateRealtimeCallbackMetrics,
  selectRealtimeActorsRoundRobin,
  createAbortAwareDelay,
  nextRealtimeJoinStartAt,
  summarizeRealtimeJoinStarts,
  summarizeCommentRewardSettlement,
} from "./loadtest-classroom-metrics.mjs";

export {
  createAbortAwareDelay,
  createClient,
  createHmac,
  encode,
  estimateRealtimeJoinSchedule,
  estimateRealtimeWave,
  exactSyntheticOutboxSources,
  expectedRealtimeMessageCounts,
  mkdir,
  nextRealtimeJoinStartAt,
  parseRequestValidation,
  path,
  performance,
  randomBytes,
  readFile,
  selectRealtimeActorsRoundRobin,
  summarizeCommentRewardSettlement,
  summarizeRealtimeJoinStarts,
  updateRealtimeCallbackMetrics,
  writeFile,
};

export const execFileAsync = promisify(execFile);

for (const envFile of [".env.local", ".env"]) {
  try {
    process.loadEnvFile?.(path.resolve(envFile));
  } catch {
    // The deployed service already supplies its environment. Missing local
    // dotenv files are normal in CI and on Oracle.
  }
}

export function integerEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function numberEnv(name, fallback, { min = 0, max = Number.MAX_VALUE } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}`);
  }
  return value;
}

export const runId = `lt-${Date.now().toString(36)}-${randomBytes(2).toString("hex")}`;
export const target = new URL(process.env.LOADTEST_TARGET ?? "http://127.0.0.1:3010");
export const localTarget = ["127.0.0.1", "localhost", "::1"].includes(target.hostname);
export const configuredTargetGitSha = process.env.LOADTEST_TARGET_GIT_SHA?.trim();
export const targetGitSha = localTarget && !configuredTargetGitSha
  ? "local-working-tree"
  : configuredTargetGitSha;
if (!localTarget && !targetGitSha) {
  throw new Error("Remote load targets require LOADTEST_TARGET_GIT_SHA");
}
if (
  (!localTarget && targetGitSha === "local-working-tree") ||
  (targetGitSha !== "local-working-tree" && !/^[0-9a-f]{7,40}$/i.test(targetGitSha ?? ""))
) {
  throw new Error("LOADTEST_TARGET_GIT_SHA must be a 7-40 character hexadecimal git SHA");
}
export const forwardedHost =
  process.env.LOADTEST_FORWARDED_HOST?.trim() ||
  (localTarget ? "aura-board.com" : target.host);
export const forwardedProto =
  process.env.LOADTEST_FORWARDED_PROTO?.trim() ||
  (localTarget ? "https" : target.protocol.replace(/:$/, ""));
if (!localTarget && process.env.LOADTEST_ALLOW_REMOTE !== "1") {
  throw new Error("Remote load targets require LOADTEST_ALLOW_REMOTE=1");
}
if (process.env.LOADTEST_ALLOW_DATABASE_WRITE !== "1") {
  throw new Error("Synthetic seed writes require LOADTEST_ALLOW_DATABASE_WRITE=1");
}

export const authSecret = process.env.AUTH_SECRET?.trim();
export const databaseUrl = process.env.DATABASE_URL?.trim();
if (!authSecret) throw new Error("AUTH_SECRET is required");
if (!databaseUrl) throw new Error("DATABASE_URL is required");

export function optionalIntegerEnv(name, options) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  return integerEnv(name, null, options);
}

export const approval = evaluateRealtimeApproval(
  process.env.LOADTEST_ALLOW_APPROVED_REALTIME_OVERRIDE,
  process.env.LOADTEST_REALTIME_APPROVAL_REFERENCE,
);

export const config = {
  classrooms: integerEnv("LOADTEST_CLASSROOMS", 50, { min: 1, max: 100 }),
  studentsPerClass: integerEnv("LOADTEST_STUDENTS_PER_CLASS", 20, { min: 1, max: 50 }),
  teacherWindowMs: integerEnv("LOADTEST_TEACHER_WINDOW_MS", 5_000, { min: 0, max: 120_000 }),
  boardOpenWindowMs: integerEnv("LOADTEST_BOARD_OPEN_WINDOW_MS", 20_000, { min: 0, max: 180_000 }),
  realtimeWindowMs: integerEnv("LOADTEST_REALTIME_WINDOW_MS", 20_000, { min: 0, max: 180_000 }),
  snapshotWindowMs: integerEnv("LOADTEST_SNAPSHOT_WINDOW_MS", 10_000, { min: 0, max: 180_000 }),
  cardWindowMs: integerEnv("LOADTEST_CARD_WINDOW_MS", 10_000, { min: 0, max: 180_000 }),
  commentWindowMs: integerEnv("LOADTEST_COMMENT_WINDOW_MS", 15_000, { min: 0, max: 180_000 }),
  likeWindowMs: integerEnv("LOADTEST_LIKE_WINDOW_MS", 15_000, { min: 0, max: 180_000 }),
  requestTimeoutMs: integerEnv("LOADTEST_REQUEST_TIMEOUT_MS", 45_000, { min: 1_000, max: 180_000 }),
  realtimeTimeoutMs: integerEnv("LOADTEST_REALTIME_TIMEOUT_MS", 20_000, { min: 1_000, max: 120_000 }),
  realtimeSettleTimeoutMs: integerEnv("LOADTEST_REALTIME_SETTLE_TIMEOUT_MS", 15_000, { min: 0, max: 120_000 }),
  commentRewardSettleTimeoutMs: integerEnv("LOADTEST_COMMENT_REWARD_SETTLE_TIMEOUT_MS", 30_000, { min: 0, max: 300_000 }),
  commentRewardPollIntervalMs: integerEnv("LOADTEST_COMMENT_REWARD_POLL_INTERVAL_MS", 250, { min: 50, max: 5_000 }),
  cleanupTimeoutMs: integerEnv("LOADTEST_CLEANUP_TIMEOUT_MS", 15_000, { min: 0, max: 120_000 }),
  realtimeClients: integerEnv("LOADTEST_REALTIME_CLIENTS", -1, { min: -1, max: 5_000 }),
  realtimeBaselineConnections: optionalIntegerEnv("LOADTEST_REALTIME_BASELINE_CONNECTIONS", { min: 0, max: 100_000 }),
  realtimeConnectionLimit: integerEnv("LOADTEST_REALTIME_CONNECTION_LIMIT", 500, { min: 1, max: 100_000 }),
  realtimeConnectionHeadroom: integerEnv("LOADTEST_REALTIME_CONNECTION_HEADROOM", 50, { min: 0, max: 100_000 }),
  realtimeMaxJoinRate: numberEnv("LOADTEST_REALTIME_MAX_JOIN_RATE", 100, { min: 0.01, max: 100_000 }),
  realtimeMaxMessageRate: numberEnv("LOADTEST_REALTIME_MAX_MESSAGE_RATE", 400, { min: 0.01, max: 100_000 }),
  realtimeBaselineMessageRate: optionalIntegerEnv("LOADTEST_REALTIME_BASELINE_MESSAGE_RATE", { min: 0, max: 100_000 }),
  realtimeMessageLimit: integerEnv("LOADTEST_REALTIME_MESSAGE_LIMIT", 500, { min: 1, max: 100_000 }),
  realtimeMessageHeadroom: integerEnv("LOADTEST_REALTIME_MESSAGE_HEADROOM", 50, { min: 0, max: 100_000 }),
  realtimeOverrideAcknowledged: approval.acknowledged,
  realtimeApprovalReference: approval.reference,
  sampleIntervalMs: integerEnv("LOADTEST_SAMPLE_INTERVAL_MS", 1_000, { min: 250, max: 30_000 }),
  serverPid: integerEnv("LOADTEST_SERVER_PID", 0, { min: 0, max: 4_294_967_295 }),
  forwardedHost,
  forwardedProto,
  maxErrorRate: numberEnv("LOADTEST_MAX_ERROR_RATE", 0.01, { min: 0, max: 1 }),
  maxReadP95Ms: numberEnv("LOADTEST_MAX_READ_P95_MS", 1_500, { min: 1 }),
  maxWriteP95Ms: numberEnv("LOADTEST_MAX_WRITE_P95_MS", 2_500, { min: 1 }),
};
config.totalStudents = config.classrooms * config.studentsPerClass;
if (config.realtimeClients < 0) config.realtimeClients = config.totalStudents;
export const realtimeAllocation = evaluateRealtimeAllocation({
  totalStudents: config.totalStudents,
  realtimeClients: config.realtimeClients,
  baselineConnections: config.realtimeBaselineConnections,
  connectionLimit: config.realtimeConnectionLimit,
  connectionHeadroom: config.realtimeConnectionHeadroom,
  realtimeWindowMs: config.realtimeWindowMs,
  maxJoinRate: config.realtimeMaxJoinRate,
  messageLimit: config.realtimeMessageLimit,
  messageHeadroom: config.realtimeMessageHeadroom,
  baselineMessageRate: config.realtimeBaselineMessageRate,
  maxDeliveryCallbackRate: config.realtimeMaxMessageRate,
  overrideAcknowledged: config.realtimeOverrideAcknowledged,
});
config.realtimeAllocation = realtimeAllocation;

export function databaseDescriptor(raw) {
  try {
    const parsed = new URL(raw);
    return {
      host: parsed.hostname,
      port: parsed.port || null,
      database: parsed.pathname.replace(/^\//, "") || null,
    };
  } catch {
    return { host: "unparseable", port: null, database: null };
  }
}

export function loadGeneratorDatabaseUrl(raw) {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol.startsWith("postgres")) {
      parsed.searchParams.set("connection_limit", "3");
      parsed.searchParams.set("pool_timeout", "30");
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

export const db = new PrismaClient({
  datasources: { db: { url: loadGeneratorDatabaseUrl(databaseUrl) } },
  log: ["error"],
});

export const resultPath = path.resolve(
  process.env.LOADTEST_RESULT ?? path.join("tmp", "loadtests", `${runId}.json`),
);
export const result = {
  schema: "aura-board/classroom-loadtest/v2",
  runId,
  startedAt: new Date().toISOString(),
  target: target.origin,
  targetGitSha,
  database: databaseDescriptor(databaseUrl),
  config,
  seed: null,
  phases: [],
  realtime: {
    requested: config.realtimeClients,
    subscribed: 0,
    failed: 0,
    statusCounts: {},
    messageCounts: {},
    transportCallbacks: {
      total: 0,
      perEvent: {},
      perSecond: {},
      peakPerSecond: 0,
      rollingPeakPerSecond: 0,
    },
    expectedMessageCounts: {},
    settle: null,
  },
  samples: [],
  cleanup: null,
  commentRewardDelivery: null,
  gate: null,
  fatal: null,
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
