/**
 * @deprecated Migrated to assignment-state.vitest.ts (Vitest runner).
 * This file uses a legacy `npx tsx` harness and is NOT executed by
 * `npm run test` (vitest only picks up *.vitest.{ts,tsx} per config).
 * Keep only as reference; new tests go in the .vitest.ts file.
 *
 * Plain runner (no Jest/Vitest) — `npx tsx src/lib/__tests__/assignment-state.test.ts`.
 * Pattern matches src/lib/__tests__/card-author.test.ts.
 *
 * Covers the transition matrix from data_model.md §1.4 + canStudentSubmit()
 * deadline/allowLate branches.
 */
import {
  canStudentSubmit,
  computeTeacherTransition,
  computeStudentSubmit,
} from "../assignment-state";

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

const NOW = new Date("2026-04-15T12:00:00Z");
const PAST = new Date("2026-04-10T00:00:00Z");
const FUTURE = new Date("2026-04-20T00:00:00Z");

// ── canStudentSubmit ────────────────────────────────────────────────
check(
  "canStudentSubmit — no deadline + not_graded → allowed",
  canStudentSubmit(
    { submissionStatus: "assigned", gradingStatus: "not_graded" },
    { assignmentAllowLate: false, assignmentDeadline: null },
    NOW
  ),
  true
);
check(
  "canStudentSubmit — deadline future + not_graded → allowed",
  canStudentSubmit(
    { submissionStatus: "assigned", gradingStatus: "not_graded" },
    { assignmentAllowLate: false, assignmentDeadline: FUTURE },
    NOW
  ),
  true
);
check(
  "canStudentSubmit — deadline past + allowLate=true → allowed",
  canStudentSubmit(
    { submissionStatus: "assigned", gradingStatus: "not_graded" },
    { assignmentAllowLate: true, assignmentDeadline: PAST },
    NOW
  ),
  true
);
check(
  "canStudentSubmit — deadline past + allowLate=false → blocked",
  canStudentSubmit(
    { submissionStatus: "assigned", gradingStatus: "not_graded" },
    { assignmentAllowLate: false, assignmentDeadline: PAST },
    NOW
  ),
  false
);
check(
  "canStudentSubmit — gradingStatus=graded → blocked regardless",
  canStudentSubmit(
    { submissionStatus: "submitted", gradingStatus: "graded" },
    { assignmentAllowLate: true, assignmentDeadline: FUTURE },
    NOW
  ),
  false
);
check(
  "canStudentSubmit — gradingStatus=released → blocked",
  canStudentSubmit(
    { submissionStatus: "reviewed", gradingStatus: "released" },
    { assignmentAllowLate: true, assignmentDeadline: FUTURE },
    NOW
  ),
  false
);
check(
  "canStudentSubmit — orphaned → blocked",
  canStudentSubmit(
    { submissionStatus: "orphaned", gradingStatus: "not_graded" },
    { assignmentAllowLate: true, assignmentDeadline: null },
    NOW
  ),
  false
);

// ── computeTeacherTransition — open ─────────────────────────────────
const openSubmitted = computeTeacherTransition(
  { submissionStatus: "submitted", gradingStatus: "not_graded" },
  { transition: "open" },
  NOW
);
check(
  "open — submitted → viewed stamps viewedAt",
  openSubmitted.ok && openSubmitted.next.submissionStatus,
  "viewed"
);
check(
  "open — submitted → viewedAt present",
  openSubmitted.ok && openSubmitted.next.viewedAt instanceof Date,
  true
);

const openViewed = computeTeacherTransition(
  { submissionStatus: "viewed", gradingStatus: "not_graded" },
  { transition: "open" },
  NOW
);
check(
  "open — viewed stays viewed (idempotent)",
  openViewed.ok && openViewed.next.submissionStatus,
  "viewed"
);

const openAssigned = computeTeacherTransition(
  { submissionStatus: "assigned", gradingStatus: "not_graded" },
  { transition: "open" },
  NOW
);
check(
  "open — assigned → invalid_transition",
  openAssigned.ok === false && openAssigned.code,
  "invalid_transition"
);

// ── computeTeacherTransition — return ───────────────────────────────
const returnViewed = computeTeacherTransition(
  { submissionStatus: "viewed", gradingStatus: "not_graded" },
  { transition: "return", returnReason: "사진이 잘렸어요" },
  NOW
);
check(
  "return — viewed → returned",
  returnViewed.ok && returnViewed.next.submissionStatus,
  "returned"
);
check(
  "return — resets gradingStatus to not_graded",
  returnViewed.ok && returnViewed.next.gradingStatus,
  "not_graded"
);
check(
  "return — returnReason persisted",
  returnViewed.ok && returnViewed.next.returnReason,
  "사진이 잘렸어요"
);

const returnAssigned = computeTeacherTransition(
  { submissionStatus: "assigned", gradingStatus: "not_graded" },
  { transition: "return", returnReason: "x" },
  NOW
);
check(
  "return — assigned → invalid_transition",
  returnAssigned.ok === false && returnAssigned.code,
  "invalid_transition"
);

// ── computeTeacherTransition — review ───────────────────────────────
const reviewViewed = computeTeacherTransition(
  { submissionStatus: "viewed", gradingStatus: "not_graded" },
  { transition: "review" },
  NOW
);
check(
  "review — viewed → reviewed",
  reviewViewed.ok && reviewViewed.next.submissionStatus,
  "reviewed"
);

const reviewAssigned = computeTeacherTransition(
  { submissionStatus: "assigned", gradingStatus: "not_graded" },
  { transition: "review" },
  NOW
);
check(
  "review — assigned → invalid_transition",
  reviewAssigned.ok === false,
  true
);

// ── computeTeacherTransition — grade ────────────────────────────────
const gradeSubmitted = computeTeacherTransition(
  { submissionStatus: "submitted", gradingStatus: "not_graded" },
  { transition: "grade", grade: "A+" },
  NOW
);
check(
  "grade — submitted → gradingStatus=graded, grade=A+",
  gradeSubmitted.ok &&
    gradeSubmitted.next.gradingStatus === "graded" &&
    gradeSubmitted.next.grade === "A+",
  true
);
check(
  "grade — submissionStatus unchanged",
  gradeSubmitted.ok && gradeSubmitted.next.submissionStatus,
  "submitted"
);

const gradeOrphaned = computeTeacherTransition(
  { submissionStatus: "orphaned", gradingStatus: "not_graded" },
  { transition: "grade", grade: "B" },
  NOW
);
check(
  "grade — orphaned → invalid_transition",
  gradeOrphaned.ok === false,
  true
);

// ── computeStudentSubmit ────────────────────────────────────────────
check(
  "studentSubmit — assigned → submitted",
  computeStudentSubmit("assigned"),
  { ok: true, next: "submitted" }
);
check(
  "studentSubmit — returned → submitted",
  computeStudentSubmit("returned"),
  { ok: true, next: "submitted" }
);
check(
  "studentSubmit — submitted → submitted (overwrite)",
  computeStudentSubmit("submitted"),
  { ok: true, next: "submitted" }
);
check(
  "studentSubmit — orphaned → blocked",
  computeStudentSubmit("orphaned"),
  { ok: false, next: "orphaned" }
);

// ── Report ──────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of fails) console.log(`❌ ${f}`);
  process.exit(1);
}
