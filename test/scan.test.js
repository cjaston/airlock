import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseManifest } from "../dist/core/scan.js";

function fixture(name, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "airlock-scan-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
}

const pairs = (file) => parseManifest(file).map((t) => [t.name, t.ecosystem]);

test("package.json dependencies", () => {
  const file = fixture(
    "package.json",
    JSON.stringify({
      dependencies: { express: "^5.0.0" },
      devDependencies: { typescript: "^5.0.0" },
    }),
  );
  assert.deepEqual(pairs(file), [
    ["express", "npm"],
    ["typescript", "npm"],
  ]);
});

test("python requirements and pyproject", () => {
  assert.deepEqual(pairs(fixture("requirements.txt", "requests==2\n# comment\n-e .")), [
    ["requests", "pypi"],
  ]);
  assert.deepEqual(
    pairs(fixture("pyproject.toml", 'dependencies = ["flask>=3", "httpx"]')),
    [
      ["flask", "pypi"],
      ["httpx", "pypi"],
    ],
  );
});

test("cargo, gemfile, and go.mod manifests", () => {
  assert.deepEqual(
    pairs(fixture("Cargo.toml", "[dependencies]\nserde = \"1\"\nregex = { version = \"1\" }\n")),
    [
      ["serde", "cargo"],
      ["regex", "cargo"],
    ],
  );
  assert.deepEqual(pairs(fixture("Gemfile", 'gem "rails"\ngem "sidekiq"\n')), [
    ["rails", "rubygems"],
    ["sidekiq", "rubygems"],
  ]);
  assert.deepEqual(
    pairs(
      fixture(
        "go.mod",
        "module example.com/x\nrequire (\n  github.com/gin-gonic/gin v1.10.0\n  golang.org/x/sync v0.7.0\n)\n",
      ),
    ),
    [
      ["github.com/gin-gonic/gin", "go"],
      ["golang.org/x/sync", "go"],
    ],
  );
});
