import { test } from "node:test";
import assert from "node:assert/strict";
import { extractInstallTargets } from "../dist/core/parse-command.js";

const names = (cmd) => extractInstallTargets(cmd).map((t) => t.name);

test("npm install with multiple packages", () => {
  assert.deepEqual(names("npm install express react"), ["express", "react"]);
});

test("flags are skipped", () => {
  assert.deepEqual(names("npm install --save-dev typescript"), ["typescript"]);
});

test("scoped package with version", () => {
  assert.deepEqual(names("npm i @scope/pkg@1.2.3"), ["@scope/pkg"]);
});

test("pip versions and extras are stripped", () => {
  const out = extractInstallTargets("pip install requests==2.0 flask").map((t) => [
    t.name,
    t.ecosystem,
  ]);
  assert.deepEqual(out, [
    ["requests", "pypi"],
    ["flask", "pypi"],
  ]);
});

test("yarn add", () => {
  assert.deepEqual(names("yarn add lodash"), ["lodash"]);
});

test("uv pip install", () => {
  assert.deepEqual(names("uv pip install numpy"), ["numpy"]);
});

test("non-install commands yield nothing", () => {
  assert.deepEqual(names("npm run build"), []);
});

test("local paths are not treated as packages", () => {
  assert.deepEqual(names("npm install ."), []);
});

test("install survives && chaining", () => {
  assert.deepEqual(names("npm install express && rm -rf /"), ["express"]);
});
