/**
 * Plain runner (no Jest/Vitest) — `npx tsx src/lib/__tests__/card-author.test.ts`.
 * Pattern matches src/lib/__tests__/canva-embed.test.ts.
 */
import { pickAuthorName, formatRelativeKo } from "../card-author";

let passed = 0;
let failed = 0;
const fails: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) passed++;
  else {
    failed++;
    fails.push(
      `${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
    );
  }
}

// pickAuthorName fallback chain
check("pickAuthorName — external wins", pickAuthorName("공서희", "학생", "선생"), "공서희");
check("pickAuthorName — student fallback", pickAuthorName(null, "학생", "선생"), "학생");
check("pickAuthorName — author fallback", pickAuthorName(null, null, "선생"), "선생");
check("pickAuthorName — all null → null", pickAuthorName(null, null, null), null);
check("pickAuthorName — empty string treated as truthy (?? semantics)", pickAuthorName("", "학생", "선생"), "");
check("pickAuthorName — undefined skipped", pickAuthorName(undefined, "학생", undefined), "학생");

// formatRelativeKo — fixed `now` for determinism
const NOW = new Date("2026-04-13T12:00:00Z").getTime();
const at = (iso: string) => formatRelativeKo(iso, NOW).rel;
check(
  "formatRelativeKo treats DB timestamp without timezone as UTC",
  at("2026-04-13T09:00:00"),
  at("2026-04-13T09:00:00Z"),
);
check("formatRelativeKo — 0s = 방금", at("2026-04-13T12:00:00Z"), "방금");
check("formatRelativeKo — 29s = 방금", at("2026-04-13T11:59:31Z"), "방금");
check("formatRelativeKo — 30s = 30초 전", at("2026-04-13T11:59:30Z"), "30초 전");
check("formatRelativeKo — 5분 전", at("2026-04-13T11:55:00Z"), "5분 전");
check("formatRelativeKo — 3시간 전", at("2026-04-13T09:00:00Z"), "3시간 전");
check("formatRelativeKo — 2일 전", at("2026-04-11T12:00:00Z"), "2일 전");
// ≥ 7일은 toLocaleDateString — 정확한 출력은 환경 의존이라 형태만 검증
const old = formatRelativeKo("2026-03-01T12:00:00Z", NOW).rel;
check("formatRelativeKo — ≥7일은 절대 날짜(숫자 포함)", /\d/.test(old), true);

console.log(`card-author specs: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const msg of fails) console.error("FAIL:", msg);
  process.exit(1);
}
