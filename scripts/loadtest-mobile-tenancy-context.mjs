
/**
 * Production-shaped mobile tenancy load test.
 *
 * The script intentionally uses only public application APIs. Synthetic rows
 * must already exist with the deterministic RUN_ID naming convention described
 * below; the operator is responsible for creating and deleting those rows.
 *
 * Required environment:
 *   LOADTEST_RUN_ID
 *   LOADTEST_TEACHER_USERNAME
 *   LOADTEST_TEACHER_PASSWORD
 *
 * Optional environment:
 *   LOADTEST_TARGET=https://aura-board.com
 *   LOADTEST_PROFILE=smoke|full
 *   LOADTEST_CLASSROOM_OFFSET=0
 *   LOADTEST_CLASSROOMS=50
 *   LOADTEST_STUDENTS_PER_CLASS=20
 *   LOADTEST_STUDENT_CODE_PREFIX=X8
 *   LOADTEST_ARRIVAL_MS=20000
 *   LOADTEST_MIXED_ACTIONS=4
 *   LOADTEST_TIMEOUT_MS=15000
 *   LOADTEST_OMOK_POLL_ATTEMPTS=6
 *   LOADTEST_OMOK_POLL_BASE_MS=750
 *   LOADTEST_OMOK_POLL_MAX_MS=6000
 */

import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import process from "node:process";

const env = process.env;
export const TARGET = (env.LOADTEST_TARGET ?? "https://aura-board.com").replace(/\/$/, "");
export const RUN_ID = required("LOADTEST_RUN_ID");
export const TEACHER_USERNAME = required("LOADTEST_TEACHER_USERNAME");
export const TEACHER_PASSWORD = required("LOADTEST_TEACHER_PASSWORD");
export const PROFILE = env.LOADTEST_PROFILE === "smoke" ? "smoke" : "full";
export const CLASSROOM_OFFSET = integerEnv("LOADTEST_CLASSROOM_OFFSET", 0, 0, 999);
export const CLASSROOMS = integerEnv("LOADTEST_CLASSROOMS", PROFILE === "smoke" ? 2 : 50, 1, 100);
export const STUDENTS_PER_CLASS = integerEnv("LOADTEST_STUDENTS_PER_CLASS", 20, 1, 100);
export const STUDENT_CODE_PREFIX = env.LOADTEST_STUDENT_CODE_PREFIX ?? "X8";
export const ARRIVAL_MS = integerEnv("LOADTEST_ARRIVAL_MS", PROFILE === "smoke" ? 2_000 : 20_000, 0, 120_000);
export const MIXED_ACTIONS = integerEnv("LOADTEST_MIXED_ACTIONS", 4, 0, 20);
export const TIMEOUT_MS = integerEnv("LOADTEST_TIMEOUT_MS", 15_000, 1_000, 120_000);
export const RETRY_LIMIT = integerEnv("LOADTEST_SHADOW_RETRY_LIMIT", 35, 1, 100);
export const OMOK_POLL_ATTEMPTS = integerEnv(
  "LOADTEST_OMOK_POLL_ATTEMPTS",
  PROFILE === "smoke" ? 2 : 6,
  1,
  20,
);
export const OMOK_POLL_BASE_MS = integerEnv("LOADTEST_OMOK_POLL_BASE_MS", 750, 100, 30_000);
export const OMOK_POLL_MAX_MS = integerEnv("LOADTEST_OMOK_POLL_MAX_MS", 6_000, 100, 60_000);
export const READ_P95_BUDGET_MS = integerEnv("LOADTEST_READ_P95_MS", 1_500, 100, 60_000);
export const WRITE_P95_BUDGET_MS = integerEnv("LOADTEST_WRITE_P95_MS", 2_500, 100, 60_000);
export const RESULT_DIR = env.LOADTEST_RESULT_DIR ?? "tmp/loadtests";
export const RUN_STARTED_AT = new Date();

export const metrics = [];
export const phases = [];
export const logical = {
  actorsPlanned: CLASSROOMS * STUDENTS_PER_CLASS,
  actorsAuthenticated: 0,
  tenantLeaks: 0,
  cardsCreated: 0,
  commentsCreated: 0,
  likesUpdated: 0,
  petHomesRead: 0,
  petClassroomsRead: 0,
  shadowOneShotJoined: 0,
  shadowOneShotConflicts: 0,
  shadowJoinedAfterRetry: 0,
  shadowReadyAfterRetry: 0,
  shadowStarted: 0,
  shadowSubmittedAfterRetry: 0,
  omokMatched: 0,
  omokSessions: 0,
  omokFirstMoves: 0,
  omokSecondMoves: 0,
  mixedActionsCompleted: 0,
};

function required(name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function integerEnv(name, fallback, min, max) {
  const raw = env[name];
  const value = raw == null || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function pad(value, width) {
  return String(value).padStart(width, "0");
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function jitter(baseMs, spreadMs, seed = Math.random()) {
  return baseMs + Math.floor(seed * spreadMs);
}

export function requestId(prefix, actor, attempt = 0) {
  const suffix = `${actor?.globalIndex ?? "host"}.${attempt}.${Date.now().toString(36)}.${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  return `${prefix}.${suffix}`.slice(0, 128);
}

function syntheticIp(globalIndex) {
  const safe = Math.max(0, globalIndex);
  const third = Math.floor(safe / 250) % 256;
  const fourth = (safe % 250) + 1;
  return `198.18.${third}.${fourth}`;
}

function actorFor(classIndex, studentIndex) {
  const globalIndex = classIndex * STUDENTS_PER_CLASS + studentIndex;
  const classSuffix = pad(classIndex, 2);
  const studentSuffix = pad(globalIndex, 4);
  return {
    classIndex,
    studentIndex,
    globalIndex,
    studentId: `${RUN_ID}-student-${studentSuffix}`,
    code: `${STUDENT_CODE_PREFIX}${studentSuffix}`,
    classroomId: `${RUN_ID}-class-${classSuffix}`,
    boardId: `${RUN_ID}-board-${classSuffix}`,
    boardSlug: `${RUN_ID}-board-${classSuffix}`,
    promptCardId: `${RUN_ID}-prompt-${classSuffix}`,
    shadowBoardId: `${RUN_ID}-shadow-${classSuffix}`,
    omokLobbyId: `${RUN_ID}-omok-${classSuffix}`,
    ip: syntheticIp(globalIndex),
    sessionToken: null,
    shadowSnapshot: null,
    omokStatus: null,
    omokBoardId: null,
    omokSnapshot: null,
  };
}

export const actors = [];
for (let localClass = 0; localClass < CLASSROOMS; localClass += 1) {
  const classIndex = CLASSROOM_OFFSET + localClass;
  for (let studentIndex = 0; studentIndex < STUDENTS_PER_CLASS; studentIndex += 1) {
    actors.push(actorFor(classIndex, studentIndex));
  }
}

export function classRepresentatives() {
  const representatives = [];
  for (let localClass = 0; localClass < CLASSROOMS; localClass += 1) {
    representatives.push(actors[localClass * STUDENTS_PER_CLASS]);
  }
  return representatives;
}

function actorHeaders(actor, extra = {}) {
  return {
    accept: "application/json",
    "x-aura-mobile-capabilities": "loadtest-v1,student-bearer-v1,slime-v2",
    "x-aura-student-viewer": "1",
    "x-forwarded-for": actor.ip,
    ...(actor.sessionToken ? { authorization: `Bearer ${actor.sessionToken}` } : {}),
    ...extra,
  };
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function expectedStatusPredicate(expected) {
  if (typeof expected === "function") return expected;
  const allowed = new Set(Array.isArray(expected) ? expected : [expected]);
  return (status) => allowed.has(status);
}

export async function http(operation, path, options = {}) {
  const method = options.method ?? "GET";
  const expected = expectedStatusPredicate(options.expected ?? 200);
  const started = performance.now();
  let status = 0;
  let bodyText = "";
  let body = null;
  let error = null;
  let responseHeaders = null;

  const headers = {
    ...(options.actor ? actorHeaders(options.actor) : {}),
    ...(options.headers ?? {}),
  };
  let requestBody;
  if (options.json !== undefined) {
    headers["content-type"] = "application/json";
    requestBody = JSON.stringify(options.json);
  } else if (options.body !== undefined) {
    requestBody = options.body;
  }

  try {
    const response = await fetch(`${TARGET}${path}`, {
      method,
      headers,
      body: requestBody,
      redirect: options.redirect ?? "follow",
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });
    status = response.status;
    responseHeaders = response.headers;
    bodyText = await response.text();
    body = parseJson(bodyText);
    if (!expected(status)) {
      error =
        typeof body?.error === "string"
          ? body.error
          : `unexpected_status_${status}`;
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.name || caught.message : "request_failed";
  }

  const elapsedMs = performance.now() - started;
  const metric = {
    operation,
    method,
    status,
    ok: error === null,
    error,
    elapsedMs,
    responseBytes: Buffer.byteLength(bodyText),
    actorIndex: options.actor?.globalIndex ?? null,
    classIndex: options.actor?.classIndex ?? null,
    at: new Date().toISOString(),
  };
  metrics.push(metric);
  return { ...metric, body, bodyText, headers: responseHeaders };
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return value.split(/,(?=\s*[^;,\s]+=)/g).map((part) => part.trim());
}

function responseSetCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  return splitSetCookieHeader(response.headers.get("set-cookie"));
}

function absorbCookies(jar, response) {
  for (const cookie of responseSetCookies(response)) {
    const pair = cookie.split(";", 1)[0];
    const equals = pair.indexOf("=");
    if (equals <= 0) continue;
    jar.set(pair.slice(0, equals), pair.slice(equals + 1));
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

export async function loginTeacher() {
  const started = performance.now();
  const jar = new Map();
  let status = 0;
  let error = null;
  try {
    const csrfResponse = await fetch(`${TARGET}/api/auth/csrf`, {
      headers: { "x-forwarded-for": "198.19.255.1" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    absorbCookies(jar, csrfResponse);
    const csrfBody = await csrfResponse.json();
    if (!csrfResponse.ok || typeof csrfBody.csrfToken !== "string") {
      throw new Error(`teacher_csrf_${csrfResponse.status}`);
    }

    const form = new URLSearchParams({
      csrfToken: csrfBody.csrfToken,
      username: TEACHER_USERNAME,
      password: TEACHER_PASSWORD,
      callbackUrl: `${TARGET}/student`,
    });
    const loginResponse = await fetch(`${TARGET}/api/auth/callback/password`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: cookieHeader(jar),
        "x-forwarded-for": "198.19.255.1",
      },
      body: form,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    });
    status = loginResponse.status;
    absorbCookies(jar, loginResponse);
    if (status !== 302 || ![...jar.keys()].some((name) => name.includes("session-token"))) {
      throw new Error(`teacher_login_${status}`);
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "teacher_login_failed";
  }

  metrics.push({
    operation: "teacher.login",
    method: "POST",
    status,
    ok: error === null,
    error,
    elapsedMs: performance.now() - started,
    responseBytes: 0,
    actorIndex: null,
    classIndex: null,
    at: new Date().toISOString(),
  });
  if (error) throw new Error(error);
  return cookieHeader(jar);
}
