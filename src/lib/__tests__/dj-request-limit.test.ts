/**
 * Plain runner (no Jest/Vitest) — `npx tsx src/lib/__tests__/dj-request-limit.test.ts`.
 * Covers the DJ queue per-person hourly request limit helpers.
 */
import {
  DJ_REQUEST_LIMIT_ERROR,
  DJ_REQUEST_LIMIT_PER_HOUR,
  DJ_REQUEST_LIMIT_WINDOW_MS,
  buildDjRequestLimitWhere,
  getDjRequestLimitLockKey,
  getDjRequestWindowStart,
} from "../dj-request-limit";

let passed = 0;
let failed = 0;
const fails: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else {
    failed++;
    fails.push(`${label}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

const NOW = new Date("2026-05-20T08:30:00.000Z");
const WINDOW_START = new Date("2026-05-20T07:30:00.000Z");

check("limit constant — one hour max 3", DJ_REQUEST_LIMIT_PER_HOUR, 3);
check(
  "window constant — 60 minutes",
  DJ_REQUEST_LIMIT_WINDOW_MS,
  60 * 60 * 1000,
);
check(
  "error message — user-facing Korean",
  DJ_REQUEST_LIMIT_ERROR,
  "1시간에 신청곡은 3곡까지만 신청할 수 있어요.",
);
check(
  "window start — now minus one hour",
  getDjRequestWindowStart(NOW),
  WINDOW_START,
);
check(
  "lock key — student is scoped by board and studentAuthorId",
  getDjRequestLimitLockKey({
    boardId: "board-1",
    studentId: "student-1",
    userId: "user-ignored",
  }),
  "dj-request-limit:board-1:student:student-1",
);
check(
  "lock key — teacher/user is scoped by board and authorId",
  getDjRequestLimitLockKey({
    boardId: "board-1",
    userId: "teacher-1",
    studentId: null,
  }),
  "dj-request-limit:board-1:user:teacher-1",
);

check(
  "where — student is identified by studentAuthorId",
  buildDjRequestLimitWhere({
    boardId: "board-1",
    studentId: "student-1",
    userId: "user-ignored",
    windowStart: WINDOW_START,
  }),
  {
    boardId: "board-1",
    queueStatus: { not: null },
    createdAt: { gte: WINDOW_START },
    studentAuthorId: "student-1",
  },
);

check(
  "where — teacher/user is identified by authorId with no studentAuthorId",
  buildDjRequestLimitWhere({
    boardId: "board-1",
    userId: "teacher-1",
    studentId: null,
    windowStart: WINDOW_START,
  }),
  {
    boardId: "board-1",
    queueStatus: { not: null },
    createdAt: { gte: WINDOW_START },
    studentAuthorId: null,
    authorId: "teacher-1",
  },
);

console.log(`dj-request-limit specs: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const msg of fails) console.error("FAIL:", msg);
  process.exit(1);
}
