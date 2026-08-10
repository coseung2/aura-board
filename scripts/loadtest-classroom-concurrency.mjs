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

const execFileAsync = promisify(execFile);

for (const envFile of [".env.local", ".env"]) {
  try {
    process.loadEnvFile?.(path.resolve(envFile));
  } catch {
    // The deployed service already supplies its environment. Missing local
    // dotenv files are normal in CI and on Oracle.
  }
}

function integerEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function numberEnv(name, fallback, { min = 0, max = Number.MAX_VALUE } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}`);
  }
  return value;
}

const runId = `lt-${Date.now().toString(36)}-${randomBytes(2).toString("hex")}`;
const target = new URL(process.env.LOADTEST_TARGET ?? "http://127.0.0.1:3010");
const localTarget = ["127.0.0.1", "localhost", "::1"].includes(target.hostname);
const configuredTargetGitSha = process.env.LOADTEST_TARGET_GIT_SHA?.trim();
const targetGitSha = localTarget && !configuredTargetGitSha
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
const forwardedHost =
  process.env.LOADTEST_FORWARDED_HOST?.trim() ||
  (localTarget ? "aura-board.com" : target.host);
const forwardedProto =
  process.env.LOADTEST_FORWARDED_PROTO?.trim() ||
  (localTarget ? "https" : target.protocol.replace(/:$/, ""));
if (!localTarget && process.env.LOADTEST_ALLOW_REMOTE !== "1") {
  throw new Error("Remote load targets require LOADTEST_ALLOW_REMOTE=1");
}
if (process.env.LOADTEST_ALLOW_DATABASE_WRITE !== "1") {
  throw new Error("Synthetic seed writes require LOADTEST_ALLOW_DATABASE_WRITE=1");
}

const authSecret = process.env.AUTH_SECRET?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!authSecret) throw new Error("AUTH_SECRET is required");
if (!databaseUrl) throw new Error("DATABASE_URL is required");

function optionalIntegerEnv(name, options) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  return integerEnv(name, null, options);
}

const approval = evaluateRealtimeApproval(
  process.env.LOADTEST_ALLOW_APPROVED_REALTIME_OVERRIDE,
  process.env.LOADTEST_REALTIME_APPROVAL_REFERENCE,
);

const config = {
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
const realtimeAllocation = evaluateRealtimeAllocation({
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

function databaseDescriptor(raw) {
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

function loadGeneratorDatabaseUrl(raw) {
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

const db = new PrismaClient({
  datasources: { db: { url: loadGeneratorDatabaseUrl(databaseUrl) } },
  log: ["error"],
});

const resultPath = path.resolve(
  process.env.LOADTEST_RESULT ?? path.join("tmp", "loadtests", `${runId}.json`),
);
const result = {
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
let realtimeAbort = null;
const realtimeAbortDelay = createAbortAwareDelay();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hash32(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function scheduledDelay(phaseName, index, windowMs) {
  if (windowMs <= 0) return 0;
  return Math.floor((hash32(`${runId}:${phaseName}:${index}`) / 0x1_0000_0000) * windowMs);
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Math.round(sorted[index] * 10) / 10;
}

function summarizeRows(rows, durationMs) {
  const groups = new Map();
  for (const row of rows) {
    const list = groups.get(row.op) ?? [];
    list.push(row);
    groups.set(row.op, list);
  }
  return Object.fromEntries(
    [...groups.entries()].map(([op, list]) => {
      const durations = list.map((row) => row.ms).sort((left, right) => left - right);
      const failures = list.filter((row) => !row.ok);
      const statuses = {};
      const errors = {};
      for (const row of list) {
        statuses[String(row.status)] = (statuses[String(row.status)] ?? 0) + 1;
        if (!row.ok) {
          const kind = row.errorCode ?? "transport";
          errors[kind] = (errors[kind] ?? 0) + 1;
        }
      }
      return [
        op,
        {
          requests: list.length,
          errors: failures.length,
          errorRate: list.length ? failures.length / list.length : 0,
          throughputPerSecond:
            durationMs > 0 ? Math.round((list.length / (durationMs / 1_000)) * 100) / 100 : null,
          p50Ms: percentile(durations, 0.5),
          p95Ms: percentile(durations, 0.95),
          p99Ms: percentile(durations, 0.99),
          maxMs: durations.length ? Math.round(durations.at(-1) * 10) / 10 : null,
          statuses,
          errorKinds: errors,
          errorSamples: failures.slice(0, 10).map((row) => ({
            status: row.status,
            errorCode: row.errorCode,
          })),
        },
      ];
    }),
  );
}

async function timedRequest(op, pathname, options = {}, validate) {
  const started = performance.now();
  let status = 0;
  let errorCode = null;
  let ok = false;
  let metadata = {};
  try {
    const response = await fetch(new URL(pathname, target), {
      ...options,
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
    status = response.status;
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    const validation = parseRequestValidation(validate ? validate(body) : true);
    ok = response.ok && validation.ok;
    if (ok) metadata = validation.metadata;
    if (!ok) {
      errorCode =
        body && typeof body === "object" && typeof body.error === "string"
          ? body.error
          : response.ok
            ? "invalid_response"
            : `http_${response.status}`;
    }
  } catch (error) {
    errorCode =
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "timeout"
        : error instanceof Error
          ? error.message.slice(0, 160)
          : "transport";
  }
  return {
    op,
    status,
    ok,
    errorCode,
    ms: performance.now() - started,
    ...metadata,
  };
}

async function runPhase(name, items, windowMs, operation) {
  const rows = [];
  const started = Date.now();
  await Promise.all(
    items.map(async (item, index) => {
      const delay = scheduledDelay(name, index, windowMs);
      if (!(await realtimeAbortDelay.wait(delay)) || realtimeAbort) return;
      const row = await operation(item, index);
      if (Array.isArray(row)) rows.push(...row);
      else rows.push(row);
      }),
  );
  const durationMs = Date.now() - started;
  const phase = {
    name,
    users: items.length,
    arrivalWindowMs: windowMs,
    durationMs,
    aborted: Boolean(realtimeAbort),
    summary: summarizeRows(rows, durationMs),
  };
  result.phases.push(phase);
  console.log(JSON.stringify({ phase: name, durationMs, summary: phase.summary }));
  if (realtimeAbort) throw new Error(`Realtime immediate abort: ${realtimeAbort.reason}`);
  return rows;
}

async function createManyBatches(model, data, batchSize = 500) {
  for (let offset = 0; offset < data.length; offset += batchSize) {
    await model.createMany({ data: data.slice(offset, offset + batchSize) });
  }
}

function studentSessionToken(student) {
  const encoded = Buffer.from(
    JSON.stringify({
      studentId: student.id,
      classroomId: student.classroomId,
      sessionVersion: 1,
      exp: Date.now() + 6 * 60 * 60_000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", authSecret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

async function teacherSessionCookie(teacher) {
  // Auth.js selects the secure cookie name from the resolved application URL.
  // A local HTTP target and the production-mode server can disagree, so issue
  // both valid names with their own salt. The server reads only its configured
  // cookie; no browser cookie attributes are needed for this direct HTTP test.
  const cookieNames = [
    "authjs.session-token",
    "__Secure-authjs.session-token",
  ];
  const pairs = await Promise.all(
    cookieNames.map(async (cookieName) => {
      const token = await encode({
        secret: authSecret,
        salt: cookieName,
        maxAge: 6 * 60 * 60,
        token: {
          id: teacher.id,
          sub: teacher.id,
          email: teacher.email,
          name: teacher.name,
        },
      });
      return `${cookieName}=${token}`;
    }),
  );
  return pairs.join("; ");
}

function proxyHeaders() {
  return {
    host: forwardedHost,
    "x-forwarded-host": forwardedHost,
    "x-forwarded-proto": forwardedProto,
  };
}

function studentOptions(actor, body, method = "GET") {
  return {
    method,
    headers: {
      ...proxyHeaders(),
      authorization: `Bearer ${actor.token}`,
      "x-aura-student-viewer": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function teacherOptions(actor) {
  return {
    method: "GET",
    headers: {
      ...proxyHeaders(),
      cookie: actor.cookie,
    },
  };
}

async function seedSyntheticClassrooms() {
  const teachers = [];
  const classrooms = [];
  const students = [];
  const accounts = [];
  const studentCards = [];
  const boards = [];
  const boardMembers = [];
  const promptCards = [];
  const studentActors = [];

  const textPrefix = runId.replace(/[^a-z0-9]/gi, "").slice(-2).toUpperCase();
  for (let classIndex = 0; classIndex < config.classrooms; classIndex += 1) {
    const classSuffix = classIndex.toString(36).padStart(3, "0");
    const teacher = {
      id: `${runId}-teacher-${classSuffix}`,
      email: `${runId}-teacher-${classSuffix}@load.invalid`,
      name: `부하 교사 ${classIndex + 1}`,
    };
    const classroom = {
      id: `${runId}-class-${classSuffix}`,
      name: `부하 ${classIndex + 1}반`,
      code: `${runId.replace(/[^a-z0-9]/gi, "").slice(-3)}${classSuffix}`
        .slice(-6)
        .toUpperCase(),
      teacherId: teacher.id,
    };
    const board = {
      id: `${runId}-board-${classSuffix}`,
      slug: `${runId}-board-${classSuffix}`,
      title: `부하 수업 보드 ${classIndex + 1}`,
      layout: "freeform",
      classroomId: classroom.id,
    };
    const prompt = {
      id: `${runId}-prompt-${classSuffix}`,
      boardId: board.id,
      authorId: teacher.id,
      title: "오늘 수업 의견",
      content: "수업에서 알게 된 점을 남겨 주세요.",
      order: 0,
    };

    teachers.push(teacher);
    classrooms.push(classroom);
    boards.push(board);
    promptCards.push(prompt);
    boardMembers.push({
      id: `${runId}-member-${classSuffix}`,
      boardId: board.id,
      userId: teacher.id,
      role: "owner",
    });

    for (let studentIndex = 0; studentIndex < config.studentsPerClass; studentIndex += 1) {
      const globalIndex = classIndex * config.studentsPerClass + studentIndex;
      const studentSuffix = globalIndex.toString(36).padStart(4, "0");
      const student = {
        id: `${runId}-student-${studentSuffix}`,
        classroomId: classroom.id,
        number: studentIndex + 1,
        name: `${classIndex + 1}반 학생 ${studentIndex + 1}`,
        qrToken: `${runId}-qr-${studentSuffix}`,
        textCode: `${textPrefix}${studentSuffix}`.slice(-6).toUpperCase(),
      };
      const accountId = `${runId}-account-${studentSuffix}`;
      students.push(student);
      accounts.push({
        id: accountId,
        classroomId: classroom.id,
        studentId: student.id,
      });
      studentCards.push({
        id: `${runId}-bank-card-${studentSuffix}`,
        accountId,
        cardNumber: `${runId}-${studentSuffix}`,
        qrSecret: randomBytes(24).toString("hex"),
      });
      studentActors.push({
        id: student.id,
        name: student.name,
        classroomId: classroom.id,
        boardId: board.id,
        boardSlug: board.slug,
        promptCardId: prompt.id,
        classIndex,
        studentIndex,
        token: studentSessionToken(student),
      });
    }
  }

  await createManyBatches(db.user, teachers, 100);
  await createManyBatches(db.classroom, classrooms, 100);
  await createManyBatches(db.student, students, 500);
  await createManyBatches(db.studentAccount, accounts, 500);
  await createManyBatches(db.studentCard, studentCards, 500);
  await createManyBatches(db.board, boards, 100);
  await createManyBatches(db.boardMember, boardMembers, 100);
  await createManyBatches(db.card, promptCards, 100);

  const teacherActors = await Promise.all(
    teachers.map(async (teacher, classIndex) => ({
      ...teacher,
      classIndex,
      classroomId: classrooms[classIndex].id,
      boardId: boards[classIndex].id,
      cookie: await teacherSessionCookie(teacher),
    })),
  );

  return {
    teachers,
    classrooms,
    students,
    boards,
    promptCards,
    studentActors,
    teacherActors,
  };
}

function incrementCounter(object, key, amount = 1) {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 1;
  object[key] = (object[key] ?? 0) + safeAmount;
}

function recordRealtimeCallback(event) {
  const bucketCount = updateRealtimeCallbackMetrics(
    result.realtime.transportCallbacks,
    event,
    Date.now(),
  );
  if (!realtimeAbort && bucketCount > config.realtimeMaxMessageRate) {
    realtimeAbort = {
      reason: "realtime_callback_peak",
      at: new Date().toISOString(),
      bucketCount,
    };
    result.realtime.abort = realtimeAbort;
    realtimeAbortDelay.abort();
  }
}

function estimateSafeRealtimeWave(name, actors, windowMs) {
  if (config.realtimeClients <= 0) return null;
  const estimate = estimateRealtimeWave({
    selectedActors: actors,
    mutations: seeded.studentActors.map((actor, index) => ({
      boardId: actor.boardId,
      delayMs: scheduledDelay(name, index, windowMs),
    })),
    arrivalWindowMs: windowMs,
    maxDeliveryCallbackRate: config.realtimeMaxMessageRate,
    baselineMessageRate: config.realtimeBaselineMessageRate,
    messageLimit: config.realtimeMessageLimit,
    messageHeadroom: config.realtimeMessageHeadroom,
  });
  result.realtime.preflight ??= {};
  result.realtime.preflight[name] = estimate;
  return estimate;
}

async function openRealtimeChannels(actors) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key || config.realtimeClients <= 0) {
    result.realtime.skipped = !url || !key ? "public_supabase_env_missing" : "disabled";
    return [];
  }

  const selected = actors;
  const handles = [];
  const rows = [];
  const started = Date.now();
  const statusPromises = [];
  const actualJoinStarts = [];
  let lastJoinStartedAt = null;
  const scheduled = selected
    .map((actor, index) => ({
      actor,
      index,
      delay: scheduledDelay("realtime-subscribe", index, config.realtimeWindowMs),
    }))
    .sort((left, right) => left.delay - right.delay || left.index - right.index);

  for (const { actor, index, delay } of scheduled) {
      const plannedWaitMs = Math.max(0, started + delay - Date.now());
      if (!(await realtimeAbortDelay.wait(plannedWaitMs)) || realtimeAbort) break;
      const pacing = nextRealtimeJoinStartAt(
        lastJoinStartedAt,
        Date.now(),
        config.realtimeMaxJoinRate,
      );
      while (Date.now() < pacing.startAtMs) {
        if (
          !(await realtimeAbortDelay.wait(pacing.startAtMs - Date.now())) ||
          realtimeAbort
        ) {
          break;
        }
      }
      if (realtimeAbort) break;
      const start = performance.now();
      const client = createClient(url, key, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
          storageKey: `aura-load-${runId}-${index}`,
        },
      });
      let finished = false;
      let timeoutId;
      let resolveStatus;
      const statusPromise = new Promise((resolve) => {
        resolveStatus = resolve;
      });
      const channel = client
        .channel(`board:${actor.boardId}`)
        .on("broadcast", { event: "card_changed" }, (message) => {
          recordRealtimeCallback("card_changed");
          incrementCounter(
            result.realtime.messageCounts,
            "card_changed",
            Number(message?.payload?.changeCount ?? 1),
          );
        })
        .on("broadcast", { event: "board_changed" }, (message) => {
          recordRealtimeCallback("board_changed");
          const payload = message?.payload;
          const logicalCount =
            payload?.type === "engagement_batch_changed" &&
            Array.isArray(payload.changes)
              ? payload.changes.reduce(
                  (sum, change) =>
                    sum + Number(change?.changeCount ?? 1),
                  0,
                )
              : Number(payload?.changeCount ?? 1);
          incrementCounter(
            result.realtime.messageCounts,
            "board_changed",
            logicalCount,
          );
        });
      const actualStartedAt = Date.now();
      lastJoinStartedAt = actualStartedAt;
      actualJoinStarts.push(actualStartedAt - started);
      result.realtime.joinActual = summarizeRealtimeJoinStarts(
        actualJoinStarts,
        config.realtimeMaxJoinRate,
      );
      if (!result.realtime.joinActual.accepted) {
        realtimeAbort = {
          reason: "realtime_join_actual_peak",
          at: new Date().toISOString(),
          rollingPeakPerSecond: result.realtime.joinActual.rollingPeakPerSecond,
        };
        result.realtime.abort = realtimeAbort;
        realtimeAbortDelay.abort();
        break;
      }
      channel.subscribe((status) => {
          incrementCounter(result.realtime.statusCounts, status);
          if (finished) return;
          if (status === "SUBSCRIBED") {
            finished = true;
            clearTimeout(timeoutId);
            result.realtime.subscribed += 1;
            resolveStatus({ ok: true, status });
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            finished = true;
            clearTimeout(timeoutId);
            result.realtime.failed += 1;
            resolveStatus({ ok: false, status });
          }
        });
      timeoutId = setTimeout(() => {
        if (finished) return;
        finished = true;
        result.realtime.failed += 1;
        incrementCounter(result.realtime.statusCounts, "CLIENT_TIMEOUT");
        resolveStatus({ ok: false, status: "CLIENT_TIMEOUT" });
      }, config.realtimeTimeoutMs);

      handles.push({ client, channel });
      statusPromises.push(statusPromise.then((statusResult) => {
        rows.push({
          op: "realtime.subscribe",
          status: statusResult.ok ? 200 : 0,
          ok: statusResult.ok,
          errorCode: statusResult.ok ? null : statusResult.status,
          ms: performance.now() - start,
        });
      }));
  }
  await Promise.all(statusPromises);
  result.realtime.joinActual ??= summarizeRealtimeJoinStarts(
    actualJoinStarts,
    config.realtimeMaxJoinRate,
  );

  const durationMs = Date.now() - started;
  result.phases.push({
    name: "realtime-subscribe",
    users: selected.length,
    arrivalWindowMs: config.realtimeWindowMs,
    durationMs,
    summary: summarizeRows(rows, durationMs),
  });
  console.log(
    JSON.stringify({
      phase: "realtime-subscribe",
      durationMs,
      subscribed: result.realtime.subscribed,
      failed: result.realtime.failed,
    }),
  );
  return handles;
}

async function settleRealtimeMessages(actors, mutationRows) {
  if (result.realtime.skipped || config.realtimeClients <= 0) return;
  const expected = expectedRealtimeMessageCounts(actors, mutationRows, config.realtimeClients);
  result.realtime.expectedMessageCounts = expected;
  const started = Date.now();
  const complete = () =>
    Number(result.realtime.messageCounts.card_changed ?? 0) >= expected.card_changed &&
    Number(result.realtime.messageCounts.board_changed ?? 0) >= expected.board_changed;

  while (
    !complete() &&
    !realtimeAbort &&
    Date.now() - started < config.realtimeSettleTimeoutMs
  ) {
    await sleep(100);
  }

  const actual = {
    card_changed: Number(result.realtime.messageCounts.card_changed ?? 0),
    board_changed: Number(result.realtime.messageCounts.board_changed ?? 0),
  };
  const missing = {
    card_changed: Math.max(0, expected.card_changed - actual.card_changed),
    board_changed: Math.max(0, expected.board_changed - actual.board_changed),
  };
  result.realtime.settle = {
    durationMs: Date.now() - started,
    complete: missing.card_changed === 0 && missing.board_changed === 0,
    expected,
    actual,
    missing,
  };
  console.log(JSON.stringify({ phase: "realtime-settle", ...result.realtime.settle }));
}

async function readCommentRewardSettlement(commentIds) {
  if (commentIds.length === 0) {
    return summarizeCommentRewardSettlement([], [], [], Date.now());
  }
  const [outboxRows, transactionRows] = await Promise.all([
    db.notificationOutbox.findMany({
      where: { eventType: "comment_reward", sourceId: { in: commentIds } },
      select: { sourceId: true, status: true, createdAt: true },
    }),
    db.transaction.findMany({
      where: { sourceType: "comment_reward", sourceRef: { in: commentIds } },
      select: { id: true, sourceRef: true },
    }),
  ]);
  return {
    ...summarizeCommentRewardSettlement(commentIds, outboxRows, transactionRows, Date.now()),
    transactionIds: transactionRows.map((row) => row.id),
  };
}

async function settleCommentRewards(commentIds) {
  const started = Date.now();
  let settlement = await readCommentRewardSettlement(commentIds);
  while (
    !settlement.complete &&
    !settlement.dead &&
    Date.now() - started < config.commentRewardSettleTimeoutMs
  ) {
    await sleep(config.commentRewardPollIntervalMs);
    settlement = await readCommentRewardSettlement(commentIds);
  }
  result.commentRewardDelivery = {
    expected: settlement.expected,
    outboxStatusCounts: settlement.outboxStatusCounts,
    completedTransactionCount: settlement.completedTransactionCount,
    durationMs: Date.now() - started,
    complete: settlement.complete,
    oldestOutstandingAgeMs: settlement.oldestOutstandingAgeMs,
  };
  console.log(JSON.stringify({ phase: "comment-reward-settle", ...result.commentRewardDelivery }));
  return settlement.transactionIds ?? [];
}

async function closeRealtimeChannels(handles) {
  for (let offset = 0; offset < handles.length; offset += 100) {
    await Promise.all(
      handles.slice(offset, offset + 100).map(async ({ client, channel }) => {
        try {
          await client.removeChannel(channel);
        } catch {
          // Best-effort load-test cleanup.
        }
        try {
          client.realtime.disconnect();
        } catch {
          // Best-effort load-test cleanup.
        }
      }),
    );
  }
}

async function sampleServerProcess(pid) {
  if (!pid) return null;
  if (process.platform === "win32") {
    const script = [
      `$p = Get-Process -Id ${pid} -ErrorAction Stop`,
      "$o = [pscustomobject]@{cpuSeconds=$p.CPU;workingSetBytes=$p.WorkingSet64;privateBytes=$p.PrivateMemorySize64;threads=$p.Threads.Count}",
      "$o | ConvertTo-Json -Compress",
    ].join("; ");
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      { windowsHide: true, timeout: 4_000 },
    );
    return JSON.parse(stdout.trim());
  }

  const [statusText, statText] = await Promise.all([
    readFile(`/proc/${pid}/status`, "utf8"),
    readFile(`/proc/${pid}/stat`, "utf8"),
  ]);
  const rssMatch = statusText.match(/^VmRSS:\s+(\d+)\s+kB$/m);
  const privateMatch = statusText.match(/^RssAnon:\s+(\d+)\s+kB$/m);
  const stat = statText.trim().split(/\s+/);
  const clockTicks = 100;
  return {
    cpuSeconds: (Number(stat[13] ?? 0) + Number(stat[14] ?? 0)) / clockTicks,
    workingSetBytes: Number(rssMatch?.[1] ?? 0) * 1_024,
    privateBytes: Number(privateMatch?.[1] ?? 0) * 1_024,
    threads: Number(stat[19] ?? 0),
  };
}

function startOperationalSampler() {
  let stopped = false;
  let sampling = false;
  const sample = async () => {
    if (stopped || sampling) return;
    sampling = true;
    const entry = {
      at: new Date().toISOString(),
      generatorRssBytes: process.memoryUsage().rss,
      db: null,
      server: null,
    };
    try {
      const rows = await db.$queryRawUnsafe(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE state = 'active')::int AS active,
                count(*) FILTER (
                  WHERE state = 'active' AND wait_event IS NOT NULL
                )::int AS waiting,
                count(*) FILTER (
                  WHERE state = 'active' AND wait_event_type = 'Lock'
                )::int AS lock_waiting
           FROM pg_stat_activity
          WHERE datname = current_database()`,
      );
      const row = rows?.[0];
      if (row) {
        entry.db = {
          total: Number(row.total ?? 0),
          active: Number(row.active ?? 0),
          waiting: Number(row.waiting ?? 0),
          lockWaiting: Number(row.lock_waiting ?? 0),
        };
      }
    } catch (error) {
      entry.dbError = error instanceof Error ? error.message.slice(0, 160) : "unknown";
    }
    try {
      entry.server = await sampleServerProcess(config.serverPid);
    } catch (error) {
      entry.serverError = error instanceof Error ? error.message.slice(0, 160) : "unknown";
    }
    result.samples.push(entry);
    sampling = false;
  };

  void sample();
  const timer = setInterval(() => void sample(), config.sampleIntervalMs);
  return async () => {
    clearInterval(timer);
    while (sampling) await sleep(25);
    await sample().catch(() => undefined);
    stopped = true;
  };
}

function aggregateGate() {
  const operations = [];
  for (const phase of result.phases) {
    for (const [op, summary] of Object.entries(phase.summary ?? {})) {
      operations.push({ phase: phase.name, op, ...summary });
    }
  }
  const requests = operations.reduce((sum, operation) => sum + operation.requests, 0);
  const errors = operations.reduce((sum, operation) => sum + operation.errors, 0);
  const reads = operations.filter((operation) =>
    ["teacher.classrooms", "teacher.snapshot", "student.board-open", "student.snapshot"].includes(
      operation.op,
    ),
  );
  const writes = operations.filter((operation) =>
    ["card.create", "comment.create", "like.create"].includes(operation.op),
  );
  const readP95 = reads.reduce(
    (max, operation) => Math.max(max, Number(operation.p95Ms ?? 0)),
    0,
  );
  const writeP95 = writes.reduce(
    (max, operation) => Math.max(max, Number(operation.p95Ms ?? 0)),
    0,
  );
  const errorRate = requests ? errors / requests : 0;
  const failures = [];
  if (result.fatal) failures.push("fatal");
  if (errorRate > config.maxErrorRate) failures.push("error_rate");
  if (readP95 > config.maxReadP95Ms) failures.push("read_p95");
  if (writeP95 > config.maxWriteP95Ms) failures.push("write_p95");
  if (result.realtime.failed > Math.ceil(config.realtimeClients * config.maxErrorRate)) {
    failures.push("realtime_subscribe");
  }
  if (result.realtime.settle && !result.realtime.settle.complete) {
    failures.push("realtime_delivery");
  }
  if (result.realtime.transportCallbacks.rollingPeakPerSecond > config.realtimeMaxMessageRate) {
    failures.push("realtime_callback_peak");
  }
  if (result.realtime.joinActual && !result.realtime.joinActual.accepted) {
    failures.push("realtime_join_actual");
  }
  if (result.commentRewardDelivery && !result.commentRewardDelivery.complete) {
    failures.push("comment_reward_delivery");
  }

  const serverSamples = result.samples.map((sample) => sample.server).filter(Boolean);
  const dbSamples = result.samples.map((sample) => sample.db).filter(Boolean);
  return {
    passed: failures.length === 0,
    failures,
    requests,
    errors,
    errorRate,
    readP95Ms: readP95,
    writeP95Ms: writeP95,
    maxServerWorkingSetBytes: serverSamples.length
      ? Math.max(...serverSamples.map((sample) => Number(sample.workingSetBytes ?? 0)))
      : null,
    serverCpuSecondsDelta:
      serverSamples.length >= 2
        ? Number(serverSamples.at(-1).cpuSeconds ?? 0) - Number(serverSamples[0].cpuSeconds ?? 0)
        : null,
    maxDatabaseConnections: dbSamples.length
      ? Math.max(...dbSamples.map((sample) => Number(sample.total ?? 0)))
      : null,
    maxDatabaseActive: dbSamples.length
      ? Math.max(...dbSamples.map((sample) => Number(sample.active ?? 0)))
      : null,
    maxDatabaseWaiting: dbSamples.length
      ? Math.max(...dbSamples.map((sample) => Number(sample.waiting ?? 0)))
      : null,
    maxDatabaseLockWaiting: dbSamples.length
      ? Math.max(...dbSamples.map((sample) => Number(sample.lockWaiting ?? 0)))
      : null,
  };
}

async function cleanupSyntheticData(data, sourceIds) {
  if (!data) return { skipped: true };
  const boardIds = data.boards.map((board) => board.id);
  const promptCardIds = data.promptCards.map((card) => card.id);
  const classroomIds = data.classrooms.map((classroom) => classroom.id);
  const studentIds = data.students.map((student) => student.id);
  const userIds = data.teachers.map((teacher) => teacher.id);

  const [runComments, runLikes] = await Promise.all([
    db.cardComment.findMany({
      where: {
        cardId: { in: promptCardIds },
        authorStudentId: { in: studentIds },
      },
      select: { id: true },
    }),
    db.cardLike.findMany({
      where: {
        cardId: { in: promptCardIds },
        likerStudentId: { in: studentIds },
      },
      select: { id: true },
    }),
  ]);
  const commentIds = [...new Set([
    ...sourceIds.commentIds,
    ...runComments.map((comment) => comment.id),
  ])];
  const likeIds = [...new Set([
    ...sourceIds.likeIds,
    ...runLikes.map((like) => like.id),
  ])];
  const transactionIds = new Set(sourceIds.transactionIds);
  const cleanupStarted = Date.now();
  let processingOutbox = 0;
  let remainingOutbox = 0;
  let outboxSources = [];
  let stableEmptyPasses = 0;
  let cleanupStable = false;

  while (true) {
    const previousTransactionCount = transactionIds.size;
    const rewardTransactions = commentIds.length > 0
      ? await db.transaction.findMany({
          where: {
            sourceType: "comment_reward",
            sourceRef: { in: commentIds },
          },
          select: { id: true },
        })
      : [];
    for (const transaction of rewardTransactions) transactionIds.add(transaction.id);
    outboxSources = exactSyntheticOutboxSources({
      commentIds,
      likeIds,
      transactionIds: [...transactionIds],
    });
    if (outboxSources.length === 0) {
      cleanupStable = true;
      break;
    }

    await db.notificationOutbox.deleteMany({
      where: { OR: outboxSources, status: { not: "processing" } },
    });
    processingOutbox = await db.notificationOutbox.count({
      where: { OR: outboxSources, status: "processing" },
    });
    remainingOutbox = await db.notificationOutbox.count({
      where: { OR: outboxSources },
    });
    const discoveredNewTransaction = transactionIds.size > previousTransactionCount;
    stableEmptyPasses = remainingOutbox === 0 && !discoveredNewTransaction
      ? stableEmptyPasses + 1
      : 0;
    if (stableEmptyPasses >= 2) {
      cleanupStable = true;
      break;
    }
    if (Date.now() - cleanupStarted >= config.cleanupTimeoutMs) break;
    await sleep(Math.min(config.commentRewardPollIntervalMs, 250));
  }

  await db.board.deleteMany({ where: { id: { in: boardIds } } });
  await db.classroom.deleteMany({ where: { id: { in: classroomIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });

  const [boards, classrooms, students, users, outbox] = await Promise.all([
    db.board.count({ where: { id: { in: boardIds } } }),
    db.classroom.count({ where: { id: { in: classroomIds } } }),
    db.student.count({ where: { classroomId: { in: classroomIds } } }),
    db.user.count({ where: { id: { in: userIds } } }),
    outboxSources.length > 0
      ? db.notificationOutbox.count({ where: { OR: outboxSources } })
      : Promise.resolve(0),
  ]);
  return {
    boards,
    classrooms,
    students,
    users,
    outbox,
    processingOutbox,
    cleanupTimedOut: !cleanupStable,
    discoveredComments: commentIds.length,
    discoveredLikes: likeIds.length,
    discoveredRewardTransactions: transactionIds.size,
  };
}

let seeded = null;
let realtimeHandles = [];
let stopSampler = async () => undefined;
const mutationRows = [];
const syntheticSources = { commentIds: [], likeIds: [], transactionIds: [] };
try {
  if (!realtimeAllocation.accepted) {
    throw new Error(`Unsafe Realtime allocation: ${realtimeAllocation.failures.join(", ")}`);
  }
  const health = await timedRequest("health", "/api/health");
  if (!health.ok) {
    throw new Error(`Target health check failed: ${health.errorCode ?? health.status}`);
  }

  seeded = await seedSyntheticClassrooms();
  result.seed = {
    teachers: seeded.teachers.length,
    classrooms: seeded.classrooms.length,
    students: seeded.students.length,
    boards: seeded.boards.length,
  };
  console.log(JSON.stringify({ seed: result.seed }));
  stopSampler = startOperationalSampler();

  await runPhase(
    "teacher-classroom-list",
    seeded.teacherActors,
    config.teacherWindowMs,
    (teacher) =>
      timedRequest(
        "teacher.classrooms",
        "/api/toolkit/classrooms",
        teacherOptions(teacher),
        (body) => Array.isArray(body?.classrooms) && body.classrooms.length === 1,
      ),
  );

  await runPhase(
    "teacher-board-snapshot",
    seeded.teacherActors,
    config.teacherWindowMs,
    (teacher) =>
      timedRequest(
        "teacher.snapshot",
        `/api/boards/${encodeURIComponent(teacher.boardId)}/snapshot`,
        teacherOptions(teacher),
        (body) => Array.isArray(body?.cards),
      ),
  );

  await runPhase(
    "student-board-open",
    seeded.studentActors,
    config.boardOpenWindowMs,
    (student) =>
      timedRequest(
        "student.board-open",
        `/api/student/board/${encodeURIComponent(student.boardSlug)}`,
        studentOptions(student),
        (body) => body?.board?.id === student.boardId,
      ),
  );

  const selectedRealtimeActors = selectRealtimeActorsRoundRobin(
    seeded.studentActors,
    config.realtimeClients,
  );
  result.realtime.subscribersByBoard = Object.fromEntries(
    selectedRealtimeActors.reduce((counts, actor) => {
      counts.set(actor.boardId, (counts.get(actor.boardId) ?? 0) + 1);
      return counts;
    }, new Map()),
  );
  result.realtime.joinPreflight = estimateRealtimeJoinSchedule(
    selectedRealtimeActors.map((_, index) =>
      scheduledDelay("realtime-subscribe", index, config.realtimeWindowMs),
    ),
    config.realtimeMaxJoinRate,
  );
  const waveEstimates = [
    ["class-card-wave", config.cardWindowMs],
    ["class-comment-wave", config.commentWindowMs],
    ["class-like-wave", config.likeWindowMs],
  ].map(([name, windowMs]) => [
    name,
    estimateSafeRealtimeWave(name, selectedRealtimeActors, windowMs),
  ]);
  const unsafeWave = waveEstimates.find(([, estimate]) => estimate && !estimate.accepted);
  if (unsafeWave) {
    throw new Error(
      `Unsafe Realtime ${unsafeWave[0]} estimate: ${unsafeWave[1].failures.join(", ")}`,
    );
  }
  if (!result.realtime.joinPreflight.accepted) {
    throw new Error(
      `Unsafe Realtime join schedule: rolling peak ${result.realtime.joinPreflight.rollingPeakPerSecond}/sec exceeds ${config.realtimeMaxJoinRate}/sec`,
    );
  }

  realtimeHandles = await openRealtimeChannels(selectedRealtimeActors);

  await runPhase(
    "student-initial-snapshot",
    seeded.studentActors,
    config.snapshotWindowMs,
    (student) =>
      timedRequest(
        "student.snapshot",
        `/api/boards/${encodeURIComponent(student.boardId)}/snapshot`,
        studentOptions(student),
        (body) => Array.isArray(body?.cards),
      ),
  );

  mutationRows.push(...await runPhase(
    "class-card-wave",
    seeded.studentActors,
    config.cardWindowMs,
    (student, index) =>
      timedRequest(
        "card.create",
        "/api/cards",
        studentOptions(
          student,
          {
            boardId: student.boardId,
            title: `수업 응답 ${index + 1}`,
            content: `${runId} 동시 수업 카드`,
          },
          "POST",
        ),
        (body) => typeof body?.card?.id === "string" ? { boardId: student.boardId } : false,
      ),
  ));

  const commentRows = await runPhase(
    "class-comment-wave",
    seeded.studentActors,
    config.commentWindowMs,
    (student, index) =>
      timedRequest(
        "comment.create",
        `/api/cards/${encodeURIComponent(student.promptCardId)}/comments`,
        studentOptions(
          student,
          {
            content: `${runId} 수업 댓글 ${index + 1}`,
            clientRequestId: `${runId}-comment-${index}`,
            audience: "public",
          },
          "POST",
        ),
        (body) => typeof body?.item?.id === "string"
          ? { boardId: student.boardId, sourceId: body.item.id }
          : false,
      ),
  );
  mutationRows.push(...commentRows);
  syntheticSources.commentIds.push(
    ...commentRows.filter((row) => row.ok && row.sourceId).map((row) => row.sourceId),
  );

  const likeRows = await runPhase(
    "class-like-wave",
    seeded.studentActors,
    config.likeWindowMs,
    (student) =>
      timedRequest(
        "like.create",
        `/api/cards/${encodeURIComponent(student.promptCardId)}/like`,
        studentOptions(student, { liked: true }, "POST"),
        (body) => body?.liked === true ? { boardId: student.boardId } : false,
      ),
  );
  mutationRows.push(...likeRows);
  const createdLikes = await db.cardLike.findMany({
    where: {
      cardId: { in: seeded.promptCards.map((card) => card.id) },
      likerStudentId: { in: seeded.students.map((student) => student.id) },
    },
    select: { id: true },
  });
  syntheticSources.likeIds.push(...createdLikes.map((like) => like.id));

  syntheticSources.transactionIds.push(
    ...await settleCommentRewards(syntheticSources.commentIds),
  );

  await sleep(1_000);
  await runPhase(
    "student-reconcile-snapshot",
    seeded.studentActors,
    config.snapshotWindowMs,
    (student) =>
      timedRequest(
        "student.snapshot",
        `/api/boards/${encodeURIComponent(student.boardId)}/snapshot`,
        studentOptions(student),
        (body) => Array.isArray(body?.cards),
      ),
  );
  await settleRealtimeMessages(selectedRealtimeActors, mutationRows);

  result.gate = aggregateGate();
  if (!result.gate.passed) process.exitCode = 2;
} catch (error) {
  result.fatal = {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
  };
  process.exitCode = 1;
} finally {
  await stopSampler().catch(() => undefined);
  await closeRealtimeChannels(realtimeHandles);
  try {
    result.cleanup = await cleanupSyntheticData(seeded, syntheticSources);
    if (
      result.cleanup &&
      !result.cleanup.skipped &&
      [
        result.cleanup.boards,
        result.cleanup.classrooms,
        result.cleanup.students,
        result.cleanup.users,
        result.cleanup.outbox,
        result.cleanup.processingOutbox,
        result.cleanup.cleanupTimedOut,
      ].some((value) => Number(value) !== 0)
    ) {
      process.exitCode = 1;
    }
  } catch (error) {
    result.cleanup = {
      error: error instanceof Error ? error.message : String(error),
    };
    process.exitCode = 1;
  }
  result.finishedAt = new Date().toISOString();
  result.gate = aggregateGate();
  await mkdir(path.dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await db.$disconnect();
  console.log(
    JSON.stringify({
      result: resultPath,
      gate: result.gate,
      cleanup: result.cleanup,
      fatal: result.fatal,
    }),
  );
}
