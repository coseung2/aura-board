import assert from "node:assert/strict";
import { test } from "node:test";
import { rebuildCascade } from "./check-css-shard-parity.mjs";

const reader = (files) => (file) => {
  if (!(file in files)) throw new Error(`Missing file: ${file}`);
  return files[file];
};

test("split CSS modules preserve cascade while comments/formatting are ignored", () => {
  const before = reader({
    "pet.styles.ts": 'import core from "./core.css";\nimport dialog from "./dialog.css";\n',
    "core.css": '.a { color: red; }\n.a { color: blue !important; }',
    "dialog.css": '@media (min-width: 400px) { .a { display: flex; } }',
  });
  const after = reader({
    "pet.styles.ts": 'import core from "./core.css";\nimport actions from "./actions.css";\nimport dialog from "./dialog.css";\n',
    "core.css": '/* core */ .a { color: red; }',
    "actions.css": '.a { color: blue !important; }',
    "dialog.css": '@media (min-width: 400px) { .a { display: flex; } }',
  });
  assert.deepEqual(rebuildCascade("pet.styles.ts", before), rebuildCascade("pet.styles.ts", after));
});

test("nested imports preserve local rules and order rather than dropping them", () => {
  const files = { "a.css": '.x { color: red; } @import "./b.css"; .x { color: green; }', "b.css": '@import "./c.css";', "c.css": '.x { color: blue; }' };
  const actual = rebuildCascade("a.css", reader(files));
  const expected = rebuildCascade("all.css", reader({ "all.css": '.x { color: red; } .x { color: blue; } .x { color: green; }' }));
  assert.deepEqual(actual, expected);
  assert.notDeepEqual(actual, rebuildCascade("all.css", reader({ "all.css": '.x { color: blue; } .x { color: red; } .x { color: green; }' })));
});

test("declaration order, duplicate declarations and !important remain significant", () => {
  const cascade = (css) => rebuildCascade("a.css", reader({ "a.css": css }));
  assert.notDeepEqual(cascade('.a { color: red; color: blue; }'), cascade('.a { color: blue; color: red; }'));
  assert.notDeepEqual(cascade('.a { color: red !important; }'), cascade('.a { color: red; }'));
});

test("external imports are compared without network access", () => {
  const first = rebuildCascade("a.css", reader({ "a.css": '@import url("https://example.invalid/a.css");' }));
  const other = rebuildCascade("a.css", reader({ "a.css": '@import url("https://example.invalid/b.css");' }));
  assert.notDeepEqual(first, other);
});

test("missing shards and cycles fail instead of silently weakening the check", () => {
  assert.throws(() => rebuildCascade("a.css", reader({ "a.css": '@import "./missing.css";' })), /Missing file/);
  assert.throws(() => rebuildCascade("a.css", reader({ "a.css": '@import "./b.css";', "b.css": '@import "./a.css";' })), /cycle/);
  assert.throws(() => rebuildCascade("a.css", reader({ "a.css": '@import "../outside.css";' })), /escapes repository/);
});
