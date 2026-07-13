/**
 * Table-based spec for the sync helpers added in task
 * 2026-04-12-canva-oembed (phase3 §6-5 + phase7).
 *
 * This file is intentionally a plain runner (no Jest/Vitest in the repo yet)
 * so it can be executed with `npx tsx src/lib/__tests__/canva-embed.test.ts`.
 * When a test framework is adopted, the cases below should port cleanly.
 */
import { buildCanvaEmbedSrc, isCanvaDesignUrl, extractCanvaDesignId } from "../canva-url";

type Row<TFn extends (arg: string) => unknown> = {
  name: string;
  input: string;
  expected: ReturnType<TFn>;
};

const isCanvaCases: Row<typeof isCanvaDesignUrl>[] = [
  { name: "www design /view", input: "https://www.canva.com/design/DAFxyz_ABCDE/view", expected: true },
  { name: "www design /edit", input: "https://www.canva.com/design/DAFxyz_ABCDE/edit", expected: true },
  { name: "bare canva.com design", input: "https://canva.com/design/DAFxyz_ABCDE/view", expected: true },
  { name: "canva.link short", input: "https://canva.link/abc123", expected: true },
  { name: "mixed-case host", input: "https://Canva.com/design/DAFxyz_ABCDE/view", expected: true },
  { name: "query + hash tolerated", input: "https://www.canva.com/design/DAFxyz_ABCDE/view?foo=bar#hash", expected: true },
  { name: "youtube URL rejected", input: "https://www.youtube.com/watch?v=abcdefghijk", expected: false },
  { name: "blank string rejected", input: "", expected: false },
  { name: "canva.com root without design path", input: "https://www.canva.com/pricing", expected: false },
];

const extractCases: Row<typeof extractCanvaDesignId>[] = [
  { name: "www /view", input: "https://www.canva.com/design/DAFxyz_ABCDE/view", expected: "DAFxyz_ABCDE" },
  { name: "www /edit → same id", input: "https://www.canva.com/design/DAFxyz_ABCDE/edit", expected: "DAFxyz_ABCDE" },
  { name: "bare canva.com", input: "https://canva.com/design/DAFxyz_ABCDE/view", expected: "DAFxyz_ABCDE" },
  { name: "query + hash tolerated", input: "https://www.canva.com/design/DAFxyz_ABCDE/view?x=1#y", expected: "DAFxyz_ABCDE" },
  { name: "canva.link is not directly extractable", input: "https://canva.link/abc123", expected: null },
  { name: "non-canva URL → null", input: "https://example.com/design/DAFxyz_ABCDE/view", expected: null },
  { name: "malformed URL → null", input: "not a url", expected: null },
  { name: "blank string → null", input: "", expected: null },
  { name: "canva design without id → null", input: "https://www.canva.com/design//view", expected: null },
];

const embedCases: Row<typeof buildCanvaEmbedSrc>[] = [
  {
    name: "public /view without share token",
    input: "https://www.canva.com/design/DAFxyz_ABCDE/view?utm_content=DAFxyz_ABCDE",
    expected: "https://www.canva.com/design/DAFxyz_ABCDE/view?embed&meta",
  },
  {
    name: "public presentation /present with share token",
    input: "https://www.canva.com/design/DAFxyz_ABCDE/shareToken123/present",
    expected: "https://www.canva.com/design/DAFxyz_ABCDE/shareToken123/view?embed&meta",
  },
  {
    name: "non-canva URL -> null",
    input: "https://example.com/design/DAFxyz_ABCDE/view",
    expected: null,
  },
];

let passed = 0;
let failed = 0;
const fails: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    fails.push(`${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

for (const row of isCanvaCases) {
  check(`isCanvaDesignUrl — ${row.name}`, isCanvaDesignUrl(row.input), row.expected);
}
for (const row of extractCases) {
  check(`extractCanvaDesignId — ${row.name}`, extractCanvaDesignId(row.input), row.expected);
}
for (const row of embedCases) {
  check(`buildCanvaEmbedSrc — ${row.name}`, buildCanvaEmbedSrc(row.input), row.expected);
}

console.log(`canva-embed sync specs: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const msg of fails) console.error("FAIL:", msg);
  process.exit(1);
}
