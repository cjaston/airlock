import { test } from "node:test";
import assert from "node:assert/strict";
import { scanTextForSecrets } from "../dist/core/secrets.js";

test("detects high-confidence API tokens", () => {
  const github = "ghp_" + "A".repeat(32);
  const openai = "sk-" + "B".repeat(32);
  const findings = scanTextForSecrets(`GITHUB_TOKEN=${github}\nOPENAI=${openai}`);
  assert.deepEqual(findings.map((f) => f.code), ["github_token", "openai_key"]);
  assert.ok(findings.every((f) => f.preview.includes("...")));
});

test("does not flag ordinary config text", () => {
  assert.deepEqual(scanTextForSecrets("API_URL=https://example.com\nTOKEN_NAME=local"), []);
});
