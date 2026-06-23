import { test } from "node:test";
import assert from "node:assert/strict";
import { extractInstallTargets } from "../dist/core/parse-command.js";

const names = (cmd) => extractInstallTargets(cmd).map((t) => t.name);
const pairs = (cmd) => extractInstallTargets(cmd).map((t) => [t.name, t.ecosystem]);

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
  assert.deepEqual(pairs("uvx ruff check && pipx run black ."), [
    ["ruff", "pypi"],
    ["black", "pypi"],
  ]);
});

test("npm create/init scaffolds are mapped to create-* packages", () => {
  assert.deepEqual(names("npm create vite@latest my-app"), ["create-vite"]);
  assert.deepEqual(names("pnpm create next-app app"), ["create-next-app"]);
  assert.deepEqual(names("yarn create react-app app"), ["create-react-app"]);
});

test("cargo add/install packages are vetted", () => {
  assert.deepEqual(pairs("cargo add serde --features derive"), [["serde", "cargo"]]);
  assert.deepEqual(pairs("cargo install cargo-watch --version 8"), [
    ["cargo-watch", "cargo"],
  ]);
});

test("rubygems install/add packages are vetted", () => {
  assert.deepEqual(pairs("gem install rails -v 7.1"), [["rails", "rubygems"]]);
  assert.deepEqual(pairs("bundle add sidekiq"), [["sidekiq", "rubygems"]]);
});

test("go get/install modules are vetted", () => {
  assert.deepEqual(pairs("go get github.com/gin-gonic/gin@v1.10.0"), [
    ["github.com/gin-gonic/gin", "go"],
  ]);
  assert.deepEqual(pairs("go install golang.org/x/tools/cmd/stringer@latest"), [
    ["golang.org/x/tools/cmd/stringer", "go"],
  ]);
});
