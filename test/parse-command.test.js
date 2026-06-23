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

test("npx executable package is vetted", () => {
  assert.deepEqual(names("npx -y create-next-app@latest my-app"), [
    "create-next-app",
  ]);
});

test("npm exec package flag is vetted", () => {
  assert.deepEqual(names("npm exec --package cowsay -- cowsay hi"), ["cowsay"]);
});

test("dlx and bunx package executors are vetted", () => {
  assert.deepEqual(names("pnpm dlx shadcn@latest init"), ["shadcn"]);
  assert.deepEqual(names("yarn dlx tsx script.ts"), ["tsx"]);
  assert.deepEqual(names("bunx vite@latest app"), ["vite"]);
});

test("python executable package helpers are vetted", () => {
  const out = extractInstallTargets("uvx ruff check && pipx run black .").map(
    (t) => [t.name, t.ecosystem],
  );
  assert.deepEqual(out, [
    ["ruff", "pypi"],
    ["black", "pypi"],
  ]);
});

test("npm create/init scaffolds are mapped to create-* packages", () => {
  assert.deepEqual(names("npm create vite@latest my-app"), ["create-vite"]);
  assert.deepEqual(names("pnpm create next-app app"), ["create-next-app"]);
  assert.deepEqual(names("yarn create react-app app"), ["create-react-app"]);
});
