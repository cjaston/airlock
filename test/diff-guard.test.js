import { test } from "node:test";
import assert from "node:assert/strict";
import { scanDiffText } from "../dist/core/diff-guard.js";

test("flags removed assertions in test files", () => {
  const diff = `diff --git a/src/foo.test.ts b/src/foo.test.ts
--- a/src/foo.test.ts
+++ b/src/foo.test.ts
@@ -12 +12,0 @@
-expect(result).toBe(42)
`;
  assert.deepEqual(scanDiffText(diff).map((f) => f.code), ["assertion_removed"]);
});

test("flags skipped and focused tests", () => {
  const diff = `diff --git a/test/foo.spec.js b/test/foo.spec.js
--- a/test/foo.spec.js
+++ b/test/foo.spec.js
@@ -1,0 +2,2 @@
+it.skip("does the hard thing", () => {})
+test.only("only this one", () => {})
`;
  assert.deepEqual(scanDiffText(diff).map((f) => f.code), [
    "test_skip_added",
    "focused_test_added",
  ]);
});

test("ignores assertion-looking changes outside test files", () => {
  const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -5 +5,0 @@
-assert(value)
`;
  assert.deepEqual(scanDiffText(diff), []);
});

test("does not flag assertion refactors that keep assertion count", () => {
  const diff = `diff --git a/test/foo.test.js b/test/foo.test.js
--- a/test/foo.test.js
+++ b/test/foo.test.js
@@ -3 +3 @@
-const out = value(); assert.deepEqual(out, [1])
+assert.deepEqual(value(), [1])
`;
  assert.deepEqual(scanDiffText(diff), []);
});
